const Order = require('../models/Order')
const Notification = require('../models/Notification')
const { sendEmail } = require('../utils/sendEmail')

/**
 * Shiprocket Webhook Controller
 * Receives real-time tracking updates from Shiprocket external webhooks.
 * Validates payload, updates MongoDB Order status & tracking timeline,
 * and notifies buyer & seller via Socket.io and Email.
 */
exports.handleShiprocketWebhook = async (req, res) => {
  try {
    const payload = req.body
    console.log('📡 [Shiprocket Webhook Received]:', JSON.stringify(payload, null, 2))

    // Optional security check if webhook secret token is configured
    const webhookToken = req.headers['x-shiprocket-token'] || req.headers['authorization']
    if (process.env.SHIPROCKET_WEBHOOK_TOKEN && webhookToken !== process.env.SHIPROCKET_WEBHOOK_TOKEN) {
      console.warn('⚠️ [Shiprocket Webhook] Invalid webhook token header.')
      return res.status(401).json({ success: false, message: 'Unauthorized webhook request' })
    }

    const {
      awb,
      current_status,
      current_timestamp,
      order_id,
      courier_name,
      etd,
      scans
    } = payload

    if (!awb && !order_id) {
      return res.status(400).json({ success: false, message: 'AWB or Order ID required in payload' })
    }

    // Find corresponding order by AWB code or Shiprocket Order ID
    const query = awb ? { awbCode: awb } : { shiprocketOrderId: String(order_id) }
    const order = await Order.findOne(query)

    if (!order) {
      console.warn(`⚠️ [Shiprocket Webhook] No matching order found for AWB: ${awb} / OrderID: ${order_id}`)
      return res.status(200).json({ success: true, message: 'Order not found in database, acknowledged.' })
    }

    // Map Shiprocket webhook status to internal order status
    const statusUpper = (current_status || '').toUpperCase()
    let newOrderStatus = order.orderStatus

    if (statusUpper.includes('DELIVERED')) {
      newOrderStatus = 'delivered'
    } else if (statusUpper.includes('OUT FOR DELIVERY')) {
      newOrderStatus = 'shipped'
    } else if (statusUpper.includes('IN TRANSIT') || statusUpper.includes('PICKED UP') || statusUpper.includes('SHIPPED') || statusUpper.includes('DISPATCHED')) {
      newOrderStatus = 'shipped'
    } else if (statusUpper.includes('CANCELED') || statusUpper.includes('CANCELLED')) {
      newOrderStatus = 'cancelled'
    } else if (statusUpper.includes('RETURN')) {
      newOrderStatus = 'returned'
    }

    // Update order fields
    order.currentShipmentStatus = current_status || order.currentShipmentStatus
    if (courier_name) order.courierName = courier_name
    if (etd) order.expectedDeliveryDate = new Date(etd)

    if (newOrderStatus !== order.orderStatus) {
      order.orderStatus = newOrderStatus
      if (newOrderStatus === 'delivered') {
        order.deliveredAt = new Date()
        order.deliveryDate = new Date()
      }
      order.timeline.push({
        status: newOrderStatus,
        timestamp: new Date(),
        note: `Webhook status update: ${current_status}`
      })
    }

    // Process tracking scans if provided
    if (Array.isArray(scans) && scans.length > 0) {
      order.trackingEvents = scans.map(scan => ({
        activity: scan.activity || scan.location,
        location: scan.location || '',
        date: scan.date || scan.updated_at || '',
        time: scan.time || '',
        status: scan.status || scan.activity,
        sr_status: scan.sr_status || '',
        timestamp: new Date()
      }))
    } else {
      order.trackingEvents.push({
        activity: current_status,
        location: 'In Transit',
        date: current_timestamp || new Date().toISOString(),
        time: '',
        status: current_status,
        sr_status: current_status,
        timestamp: new Date()
      })
    }

    await order.save()
    console.log(`✅ [Shiprocket Webhook] Order ${order.orderNumber} updated to ${newOrderStatus}`)

    // Real-time Push Notification via Socket.io
    if (global.io) {
      global.io.to(`user_${order.buyerId.toString()}`).emit('order_updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        currentStatus: current_status
      })
      global.io.to(`seller_${order.sellerId.toString()}`).emit('seller_order_updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        currentStatus: current_status
      })
    }

    // Save notification to buyer
    await Notification.create({
      userId: order.buyerId,
      title: `Shipment Update: ${order.orderNumber}`,
      message: `Your order #${order.orderNumber} status: ${current_status}`,
      type: 'order_status',
      orderId: order._id
    }).catch(e => console.warn('Webhook notification error:', e.message))

    // Send email notification to buyer if email present
    if (order.deliveryAddress?.email) {
      sendEmail({
        to: order.deliveryAddress.email,
        subject: `Order #${order.orderNumber} Status: ${current_status}`,
        html: `<p>Dear ${order.deliveryAddress.fullName || 'Customer'},</p><p>Your order <strong>#${order.orderNumber}</strong> status is now <strong>${current_status}</strong>.</p>`
      }).catch(e => console.warn('Webhook email error:', e.message))
    }

    return res.status(200).json({
      success: true,
      message: 'Shiprocket webhook processed successfully',
      orderNumber: order.orderNumber,
      status: order.orderStatus
    })

  } catch (error) {
    console.error('❌ [Shiprocket Webhook Error]:', error.stack || error.message)
    return res.status(500).json({ success: false, message: error.message })
  }
}
