const Order = require('../models/Order')
const shiprocketService = require('./shiprocket.service')
const Notification = require('../models/Notification')
const { sendEmail } = require('../utils/sendEmail')

/**
 * Automated Shiprocket Shipment Tracking Cron Service
 * Polls Shiprocket tracking API every 15 minutes for all active non-delivered shipments.
 * Updates MongoDB Order tracking status, tracking events, timeline, and triggers Push/Email notifications.
 */
class TrackingCronService {
  constructor() {
    this.timer = null
    this.intervalMs = 15 * 60 * 1000 // 15 minutes
  }

  /**
   * Starts the 15-minute periodic tracking polling cron
   */
  start() {
    console.log('⏰ [Tracking Cron Service] Initializing 15-minute background tracking polling...')
    // Run immediately on start
    this.pollActiveShipments().catch(err => {
      console.error('❌ [Tracking Cron Error on Initial Run]:', err.message)
    })

    // Schedule 15 minute interval
    this.timer = setInterval(() => {
      this.pollActiveShipments().catch(err => {
        console.error('❌ [Tracking Cron Periodic Error]:', err.message)
      })
    }, this.intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.log('🛑 [Tracking Cron Service] Stopped.')
    }
  }

  /**
   * Poll active orders with AWBs and update status
   */
  async pollActiveShipments() {
    try {
      const activeOrders = await Order.find({
        awbCode: { $exists: true, $ne: null, $ne: '' },
        orderStatus: { $nin: ['delivered', 'cancelled', 'returned'] }
      })

      if (activeOrders.length === 0) {
        return
      }

      console.log(`📡 [Tracking Cron] Polling tracking status for ${activeOrders.length} active shipments...`)

      for (const order of activeOrders) {
        try {
          await this.syncSingleOrderTracking(order)
        } catch (err) {
          console.error(`⚠️ [Tracking Cron] Error updating order ${order.orderNumber}:`, err.message)
        }
      }
    } catch (error) {
      console.error('❌ [Tracking Cron] Failed to fetch active orders:', error.message)
    }
  }

  /**
   * Sync single order tracking status with Shiprocket
   */
  async syncSingleOrderTracking(order) {
    if (!order.awbCode) return

    const trackingData = await shiprocketService.trackShipment(order.awbCode)
    const trackResult = trackingData?.tracking_data

    if (!trackResult) return

    const trackStatus = trackResult.track_status
    const shipmentStatus = trackResult.shipment_track?.[0]?.current_status || ''
    const activities = trackResult.shipment_track_activities || []

    let isUpdated = false

    // Map Shiprocket shipment status to internal Order Status
    let newOrderStatus = order.orderStatus
    const statusUpper = shipmentStatus.toUpperCase()

    if (statusUpper.includes('DELIVERED')) {
      newOrderStatus = 'delivered'
    } else if (statusUpper.includes('OUT FOR DELIVERY')) {
      newOrderStatus = 'shipped'
    } else if (statusUpper.includes('IN TRANSIT') || statusUpper.includes('PICKED UP') || statusUpper.includes('SHIPPED')) {
      newOrderStatus = 'shipped'
    } else if (statusUpper.includes('CANCELED') || statusUpper.includes('CANCELLED')) {
      newOrderStatus = 'cancelled'
    } else if (statusUpper.includes('RETURN')) {
      newOrderStatus = 'returned'
    }

    if (newOrderStatus !== order.orderStatus) {
      order.orderStatus = newOrderStatus
      order.currentShipmentStatus = shipmentStatus
      order.currentTrackingStatus = trackResult.shipment_track?.[0]?.destination || shipmentStatus
      if (newOrderStatus === 'delivered') {
        order.deliveredAt = new Date()
        order.deliveryDate = new Date()
      }
      order.timeline.push({
        status: newOrderStatus,
        timestamp: new Date(),
        note: `Tracking status updated: ${shipmentStatus}`
      })
      isUpdated = true
    }

    // Update tracking events
    if (activities.length > 0) {
      const formattedEvents = activities.map(act => ({
        activity: act.activity || act.sr_status_label,
        location: act.location || '',
        date: act.date || '',
        time: act.time || '',
        status: act.sr_status_label || act.activity,
        sr_status: act.sr_status || '',
        timestamp: new Date()
      }))

      if (JSON.stringify(order.trackingEvents) !== JSON.stringify(formattedEvents)) {
        order.trackingEvents = formattedEvents
        isUpdated = true
      }
    }

    if (isUpdated) {
      await order.save()
      console.log(`✅ [Tracking Cron] Order ${order.orderNumber} updated to status: ${order.orderStatus}`)

      // Trigger Push and Email Notifications
      await this.sendTrackingNotifications(order, shipmentStatus)
    }
  }

  /**
   * Helper to send push and email notifications on shipment updates
   */
  async sendTrackingNotifications(order, currentStatus) {
    try {
      const title = `Shipment Update: ${order.orderNumber}`
      const message = `Your order #${order.orderNumber} status is now: ${currentStatus}`

      // Create buyer notification record
      await Notification.create({
        userId: order.buyerId,
        title,
        message,
        type: 'order_status',
        orderId: order._id
      })

      // Send Socket notification to buyer
      if (global.io) {
        global.io.to(`user_${order.buyerId.toString()}`).emit('order_updated', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          currentStatus
        })
        global.io.to(`seller_${order.sellerId.toString()}`).emit('seller_order_updated', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          currentStatus
        })
      }

      // Send Email notification to buyer address if available
      if (order.deliveryAddress?.email) {
        await sendEmail({
          to: order.deliveryAddress.email,
          subject: `UBS Global Order #${order.orderNumber} Update`,
          html: `<h3>Shipment Status Update</h3><p>Your order <strong>#${order.orderNumber}</strong> is currently: <strong>${currentStatus}</strong>.</p><p>Courier: ${order.courierName || 'Shiprocket Courier'}<br/>AWB Code: ${order.awbCode || 'N/A'}</p>`
        }).catch(e => console.warn('Email sending skipped/failed:', e.message))
      }
    } catch (err) {
      console.error('⚠️ [Tracking Notification Error]:', err.message)
    }
  }
}

module.exports = new TrackingCronService()
