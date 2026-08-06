const mongoose = require('mongoose')
const Order = require('../models/Order')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Transaction = require('../models/Transaction')
const Notification = require('../models/Notification')
const { sendEmail } = require('../utils/sendEmail')
const shiprocketService = require('../services/shiprocket.service')

/**
 * Check Courier Serviceability for Checkout
 */
exports.checkShippingServiceability = async (req, res) => {
  try {
    const { deliveryPincode, items, sellerId } = req.body

    if (!deliveryPincode) {
      return res.status(400).json({ success: false, message: 'Delivery pincode is required' })
    }

    let pickupPincode = '110001' // Default fallback pincode
    let totalWeight = 0.5
    let length = 10, width = 10, height = 10

    if (sellerId) {
      const seller = await Seller.findById(sellerId)
      const defaultPickup = seller?.pickupAddresses?.find(p => p.isDefault) || seller?.pickupAddresses?.[0]
      if (defaultPickup?.pin_code) {
        pickupPincode = defaultPickup.pin_code
      } else if (seller?.address?.zipCode) {
        pickupPincode = seller.address.zipCode
      }
    }

    if (items && Array.isArray(items)) {
      for (const item of items) {
        const prod = await Product.findById(item.productId)
        if (prod) {
          totalWeight += (prod.weight || 0.5) * (item.quantity || 1)
          if (prod.dimensions) {
            length = Math.max(length, prod.dimensions.length || 10)
            width = Math.max(width, prod.dimensions.width || 10)
            height = Math.max(height, prod.dimensions.height || 10)
          }
        }
      }
    }

    const serviceability = await shiprocketService.checkServiceability({
      pickup_postcode: pickupPincode,
      delivery_postcode: deliveryPincode,
      weight: totalWeight,
      cod: 0,
      length,
      width,
      height
    })

    res.json({
      success: true,
      serviceability
    })
  } catch (error) {
    console.error('Check serviceability error:', error.message)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Helper to process automated Shiprocket shipment pipeline for an Order
 */
async function processShiprocketOrderPipeline(order, seller) {
  try {
    const defaultPickup = seller.pickupAddresses?.find(p => p.isDefault) || seller.pickupAddresses?.[0]
    const pickupLocationTag = defaultPickup?.pickup_location || seller.shopName.toLowerCase().replace(/[^a-z0-9]/g, '_')

    // 1. Prepare Shiprocket Adhoc Order payload
    const orderItems = order.items.map(i => ({
      name: i.productName,
      sku: i.productSku || `SKU-${i.productId}`,
      units: i.quantity,
      selling_price: i.price,
      discount: 0,
      tax: 0,
      hsn: 0
    }))

    const totalWeight = order.items.reduce((acc, i) => acc + 0.5 * i.quantity, 0)

    const srPayload = {
      order_id: order.orderNumber,
      order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: pickupLocationTag,
      channel_id: '',
      comment: order.sellerNote || 'UBS Global Order',
      billing_customer_name: order.deliveryAddress.fullName || 'Customer',
      billing_last_name: '',
      billing_address: order.deliveryAddress.street,
      billing_address_2: order.deliveryAddress.landmark || '',
      billing_city: order.deliveryAddress.city,
      billing_pincode: order.deliveryAddress.zipCode,
      billing_state: order.deliveryAddress.state,
      billing_country: order.deliveryAddress.country || 'India',
      billing_email: order.deliveryAddress.email || 'customer@ubsglobal.com',
      billing_phone: order.deliveryAddress.phone,
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      shipping_charges: order.shippingFee || 0,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: 0,
      sub_total: order.subtotal,
      length: 10,
      width: 10,
      height: 10,
      weight: totalWeight
    }

    // Step A: Create Shiprocket Order
    console.log(`🚀 [Automated Pipeline] Creating Shiprocket order for ${order.orderNumber}...`)
    const srOrderRes = await shiprocketService.createOrder(srPayload)

    order.shiprocketOrderId = srOrderRes?.order_id ? String(srOrderRes.order_id) : ''
    order.shiprocketShipmentId = srOrderRes?.shipment_id ? String(srOrderRes.shipment_id) : ''
    order.currentShipmentStatus = 'ORDER CREATED'
    order.pickupStatus = 'pending'

    if (srOrderRes?.shipment_id) {
      const shipmentId = srOrderRes.shipment_id

      // Step B: Assign AWB
      try {
        console.log(`🚀 [Automated Pipeline] Assigning AWB for shipment ${shipmentId}...`)
        const awbRes = await shiprocketService.assignAWB({ shipment_id: shipmentId })
        const awbData = awbRes?.response?.data
        if (awbData?.awb_code) {
          order.awbCode = awbData.awb_code
          order.trackingNumber = awbData.awb_code
          order.courierName = awbData.courier_name || 'Shiprocket Courier'
          order.courierCompanyId = awbData.courier_company_id || null
          order.trackingUrl = `https://shiprocket.co/tracking/${awbData.awb_code}`
          order.currentShipmentStatus = 'AWB ASSIGNED'
        }
      } catch (awbErr) {
        console.warn('⚠️ [Automated Pipeline] AWB Assign warning:', awbErr.message)
      }

      // Step C: Generate Pickup
      try {
        console.log(`🚀 [Automated Pipeline] Generating pickup for shipment ${shipmentId}...`)
        const pickupRes = await shiprocketService.generatePickup({ shipment_id: shipmentId })
        if (pickupRes?.pickup_status === 1 || pickupRes?.response?.pickup_scheduled_date) {
          order.pickupStatus = 'scheduled'
          order.pickupScheduledDate = pickupRes?.response?.pickup_scheduled_date ? new Date(pickupRes.response.pickup_scheduled_date) : new Date()
          order.pickupId = String(pickupRes?.response?.pickup_id || shipmentId)
          order.currentShipmentStatus = 'PICKUP SCHEDULED'
        }
      } catch (pickErr) {
        console.warn('⚠️ [Automated Pipeline] Pickup Generate warning:', pickErr.message)
      }

      // Step D: Generate Manifest
      try {
        console.log(`🚀 [Automated Pipeline] Generating manifest for shipment ${shipmentId}...`)
        const manifestRes = await shiprocketService.generateManifest({ shipment_id: shipmentId })
        if (manifestRes?.manifest_url) {
          order.manifestUrl = manifestRes.manifest_url
        }
      } catch (manErr) {
        console.warn('⚠️ [Automated Pipeline] Manifest Generate warning:', manErr.message)
      }

      // Step E: Generate Shipping Label
      try {
        console.log(`🚀 [Automated Pipeline] Generating label for shipment ${shipmentId}...`)
        const labelRes = await shiprocketService.generateLabel({ shipment_id: shipmentId })
        if (labelRes?.label_url) {
          order.labelUrl = labelRes.label_url
        }
      } catch (lblErr) {
        console.warn('⚠️ [Automated Pipeline] Label Generate warning:', lblErr.message)
      }

      // Step F: Print/Generate Invoice
      try {
        console.log(`🚀 [Automated Pipeline] Generating invoice for order ${order.orderNumber}...`)
        const invoiceRes = await shiprocketService.printInvoice({ ids: [srOrderRes.order_id] })
        if (invoiceRes?.invoice_url) {
          order.invoiceUrl = invoiceRes.invoice_url
        }
      } catch (invErr) {
        console.warn('⚠️ [Automated Pipeline] Invoice Generate warning:', invErr.message)
      }
    }

    order.timeline.push({
      status: 'shipped',
      timestamp: new Date(),
      note: `Automated Shiprocket order created. AWB: ${order.awbCode || 'Pending'}`
    })

    await order.save()
    console.log(`✅ [Automated Pipeline Completed] Order ${order.orderNumber} successfully synced with Shiprocket.`)
  } catch (error) {
    console.error(`❌ [Automated Pipeline Error] Order ${order.orderNumber}:`, error.message)
  }
}

/**
 * Place Order with Multi-Vendor Order Splitting & Automatic Shiprocket Integration
 */
exports.placeOrder = async (req, res) => {
  try {
    const {
      items, deliveryAddress, paymentMethod, paymentIntentId, sellerNote, shippingSpeed
    } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order items are required' })
    }

    if (!deliveryAddress || typeof deliveryAddress !== 'object') {
      return res.status(400).json({ success: false, message: 'Delivery address is required' })
    }

    const fullName = (deliveryAddress.fullName || deliveryAddress.name || '').trim()
    const phone = (deliveryAddress.phone || '').trim()
    const street = (deliveryAddress.street || '').trim()
    const city = (deliveryAddress.city || '').trim()
    const country = (deliveryAddress.country || 'India').trim()
    const zipCode = (deliveryAddress.zipCode || '').trim()

    if (!fullName || !phone || !street || !city || !zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Full name, phone, street address, city, and zipCode are required in delivery address'
      })
    }

    const formattedDeliveryAddress = {
      fullName,
      name: fullName,
      phone,
      email: (deliveryAddress.email || req.user.email || '').trim(),
      street,
      landmark: (deliveryAddress.landmark || '').trim(),
      city,
      state: (deliveryAddress.state || '').trim(),
      country,
      zipCode,
      deliveryInstructions: (deliveryAddress.deliveryInstructions || '').trim()
    }

    // MULTI-VENDOR LOGIC: Group items by Seller ID
    const itemsBySeller = {}

    for (const item of items) {
      const product = await Product.findById(item.productId)
      if (!product) continue

      const sellerIdStr = product.sellerId.toString()
      if (!itemsBySeller[sellerIdStr]) {
        itemsBySeller[sellerIdStr] = []
      }

      itemsBySeller[sellerIdStr].push({
        product,
        quantity: item.quantity,
        price: product.price,
        subtotal: product.price * item.quantity
      })
    }

    const createdOrders = []

    // Process sub-order for each vendor
    for (const [sellerIdStr, vendorItems] of Object.entries(itemsBySeller)) {
      const seller = await Seller.findById(sellerIdStr)
      if (!seller) continue

      // Validate Seller Pickup Address & KYC
      const defaultPickup = seller.pickupAddresses?.find(p => p.isDefault) || seller.pickupAddresses?.[0]
      if (!defaultPickup && (!seller.address || !seller.address.zipCode)) {
        return res.status(400).json({
          success: false,
          message: `Seller "${seller.shopName}" has no default pickup address configured.`
        })
      }

      let subtotal = 0
      let shippingFee = 0
      const formattedItems = []

      for (const vItem of vendorItems) {
        subtotal += vItem.subtotal
        shippingFee += vItem.product.freeShipping ? 0 : (vItem.product.shippingFee || 50)
        formattedItems.push({
          productId: vItem.product._id,
          productName: vItem.product.title,
          productImage: vItem.product.images?.[0] || '',
          productSku: vItem.product.sku || '',
          quantity: vItem.quantity,
          price: vItem.price,
          subtotal: vItem.subtotal
        })

        // Update product inventory & total sales
        vItem.product.stock = Math.max(0, vItem.product.stock - vItem.quantity)
        vItem.product.totalSales += vItem.quantity
        await vItem.product.save()
      }

      const tax = subtotal * 0.05
      const grandTotal = subtotal + shippingFee + tax

      const commissionRate = seller.commission || 3
      const commission = Number((subtotal * (commissionRate / 100)).toFixed(2))
      const sellerEarnings = Number(subtotal.toFixed(2))
      const adminEarnings = commission

      // Create Order in DB
      const order = await Order.create({
        buyerId: req.user._id,
        sellerId: seller._id,
        items: formattedItems,
        subtotal,
        shippingFee,
        tax,
        grandTotal,
        paymentMethod: paymentMethod || 'cod',
        paymentIntentId,
        paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
        deliveryAddress: formattedDeliveryAddress,
        sellerNote: (sellerNote || '').trim(),
        shippingSpeed: shippingSpeed || 'standard',
        commissionPercent: commissionRate,
        commissionAmount: commission,
        sellerEarnings,
        adminEarnings,
        currentShipmentStatus: 'PLACED',
        timeline: [{ status: 'placed', timestamp: new Date(), note: 'Order placed by buyer' }]
      })

      // Create Financial Transaction record
      await Transaction.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        sellerId: seller._id,
        buyerId: req.user._id,
        grossAmount: grandTotal,
        commissionPercent: commissionRate,
        commissionAmount: commission,
        sellerEarnings,
        adminEarnings,
        paymentMethod,
        status: order.paymentStatus === 'paid' ? 'completed' : 'pending'
      })

      // Execute automated Shiprocket API Pipeline in background
      processShiprocketOrderPipeline(order, seller).catch(err => {
        console.error('Shiprocket pipeline error:', err.message)
      })

      // Socket.io real-time alerts
      const socketIo = global.io
      if (socketIo) {
        const payload = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          buyerName: req.user.name,
          amount: grandTotal,
          items: formattedItems,
          deliveryAddress: formattedDeliveryAddress
        }
        socketIo.to(`seller_${seller._id.toString()}`).emit('newOrder', payload)
        if (seller.userId) {
          socketIo.to(`user_${seller.userId.toString()}`).emit('newOrder', payload)
        }
      }

      // Notifications
      await Notification.create([
        {
          userId: seller._id,
          userType: 'Seller',
          title: '🛍️ New Order Received!',
          message: `Order #${order.orderNumber} - Amount: ₹${grandTotal}`,
          type: 'order',
          orderId: order._id
        },
        {
          userId: req.user._id,
          userType: 'User',
          title: '✅ Order Placed Successfully!',
          message: `Your order #${order.orderNumber} has been placed.`,
          type: 'order',
          orderId: order._id
        }
      ]).catch(e => console.warn('Notification error:', e.message))

      createdOrders.push(order)
    }

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdOrders.length} vendor order(s)`,
      orders: createdOrders,
      order: createdOrders[0] // Backward compatibility for single order responses
    })

  } catch (error) {
    console.error('Place order error:', error.stack || error.message)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Get Buyer Orders
 */
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id })
      .populate('sellerId', 'shopName shopLogo ownerName phone')
      .sort({ createdAt: -1 })
    res.json({ success: true, orders })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Track Order Details (Non-blocking, instant response with fallback)
 */
exports.trackOrder = async (req, res) => {
  try {
    const { id } = req.params

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Order ID' })
    }

    const order = await Order.findById(id)
      .populate('sellerId', 'shopName ownerName phone email address pickupAddresses')
      .populate('buyerId', 'name email phone')

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    // Immediately respond to client with order & cached tracking events
    res.json({ success: true, order })

    // Background live Shiprocket tracking sync with 3s safety timeout
    if (order.awbCode) {
      Promise.race([
        shiprocketService.trackShipment(order.awbCode),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Shiprocket track timeout')), 3000))
      ]).then(liveTracking => {
        if (liveTracking?.tracking_data?.shipment_track_activities) {
          const events = liveTracking.tracking_data.shipment_track_activities.map(act => ({
            activity: act.activity || act.sr_status_label,
            location: act.location || '',
            date: act.date || '',
            time: act.time || '',
            status: act.sr_status_label || act.activity,
            sr_status: act.sr_status || '',
            timestamp: new Date()
          }))
          if (events.length > 0) {
            order.trackingEvents = events
            order.save().catch(e => console.warn('Save order tracking error:', e.message))
          }
        }
      }).catch(err => {
        console.warn('⚠️ Live tracking background sync warning:', err.message)
      })
    }
  } catch (error) {
    console.error('Track order error:', error.message)
    res.status(500).json({ success: false, message: error.message || 'Error tracking order' })
  }
}

/**
 * Get Seller Orders with Filter Status
 */
exports.getSellerOrders = async (req, res) => {
  try {
    let seller = await Seller.findOne({ userId: req.user._id })
    if (!seller) {
      seller = await Seller.findById(req.user._id)
    }
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller profile not found' })
    }

    const { status } = req.query
    let query = { sellerId: seller._id }
    if (status && status !== 'All') {
      query.orderStatus = status.toLowerCase()
    }

    const orders = await Order.find(query)
      .populate('buyerId', 'name email phone')
      .sort({ createdAt: -1 })

    res.json({ success: true, orders })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Seller/Admin Update Order Status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, trackingNumber, courierName, estimatedDelivery } = req.body

    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    order.orderStatus = status
    if (trackingNumber) order.trackingNumber = trackingNumber
    if (courierName) order.courierName = courierName
    if (estimatedDelivery) order.estimatedDelivery = new Date(estimatedDelivery)

    order.timeline.push({
      status,
      timestamp: new Date(),
      note: `Order status updated to ${status}`
    })

    if (status === 'delivered') {
      order.deliveredAt = new Date()
      order.deliveryDate = new Date()
      order.paymentStatus = 'paid'
    }

    await order.save()

    res.json({ success: true, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Cancel Order (Buyer or Seller)
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    // Cancel on Shiprocket if order ID exists
    if (order.shiprocketOrderId) {
      try {
        await shiprocketService.cancelShipment({ ids: [order.shiprocketOrderId] })
      } catch (srErr) {
        console.warn('Shiprocket cancellation warning:', srErr.message)
      }
    }

    order.orderStatus = 'cancelled'
    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: reason || 'Order cancelled'
    })

    // Restock items
    for (const item of order.items) {
      if (item.productId) {
        const product = await Product.findById(item.productId)
        if (product) {
          product.stock += item.quantity
          product.totalSales = Math.max(0, product.totalSales - item.quantity)
          await product.save()
        }
      }
    }

    await order.save()
    res.json({ success: true, message: 'Order cancelled successfully', order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Assign AWB
 */
exports.assignAWB = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order || !order.shiprocketShipmentId) {
      return res.status(400).json({ success: false, message: 'Order or Shiprocket shipment ID not found' })
    }

    const awbRes = await shiprocketService.assignAWB({ shipment_id: order.shiprocketShipmentId })
    const awbData = awbRes?.response?.data
    if (awbData?.awb_code) {
      order.awbCode = awbData.awb_code
      order.trackingNumber = awbData.awb_code
      order.courierName = awbData.courier_name || 'Shiprocket Courier'
      order.courierCompanyId = awbData.courier_company_id || null
      order.trackingUrl = `https://shiprocket.co/tracking/${awbData.awb_code}`
      await order.save()
    }

    res.json({ success: true, message: 'AWB assigned successfully', awbData, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Generate Pickup
 */
exports.generatePickup = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order || !order.shiprocketShipmentId) {
      return res.status(400).json({ success: false, message: 'Order or Shiprocket shipment ID not found' })
    }

    const pickupRes = await shiprocketService.generatePickup({ shipment_id: order.shiprocketShipmentId })
    order.pickupStatus = 'scheduled'
    order.pickupId = String(pickupRes?.response?.pickup_id || order.shiprocketShipmentId)
    await order.save()

    res.json({ success: true, message: 'Pickup scheduled successfully', pickupRes, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Generate Manifest & Download Link
 */
exports.generateManifest = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order || !order.shiprocketShipmentId) {
      return res.status(400).json({ success: false, message: 'Order or Shiprocket shipment ID not found' })
    }

    const manifestUrl = await shiprocketService.downloadManifest(order.shiprocketShipmentId)
    if (manifestUrl) {
      order.manifestUrl = manifestUrl
      await order.save()
    }

    res.json({ success: true, manifestUrl, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Generate Label & Download Link (With Instant Fallback)
 */
exports.generateLabel = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    let labelUrl = order.labelUrl
    if (!labelUrl && order.shiprocketShipmentId) {
      labelUrl = await shiprocketService.downloadLabel(order.shiprocketShipmentId).catch(() => null)
      if (labelUrl) {
        order.labelUrl = labelUrl
        await order.save().catch(() => null)
      }
    }

    if (!labelUrl) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https'
      const host = req.get('host')
      labelUrl = `${protocol}://${host}/api/orders/${order._id}/view-label`
    }

    res.json({ success: true, labelUrl, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Generate Invoice & Download Link (With Instant Fallback)
 */
exports.generateInvoice = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    let invoiceUrl = order.invoiceUrl
    if (!invoiceUrl && order.shiprocketOrderId) {
      const invRes = await shiprocketService.generateInvoice([order.shiprocketOrderId]).catch(() => null)
      invoiceUrl = invRes?.invoice_url || invRes?.url || invRes?.result?.invoice_url
      if (invoiceUrl) {
        order.invoiceUrl = invoiceUrl
        await order.save().catch(() => null)
      }
    }

    if (!invoiceUrl) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https'
      const host = req.get('host')
      invoiceUrl = `${protocol}://${host}/api/orders/${order._id}/view-invoice`
    }

    res.json({ success: true, invoiceUrl, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Render Official HTML Tax Invoice for Order
 */
exports.viewInvoice = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id).populate('sellerId').populate('buyerId')
    if (!order) {
      return res.status(404).send('<h2>Order Not Found</h2>')
    }

    const itemsHtml = (order.items || []).map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName || 'Product'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${order.paymentCurrency === 'INR' ? '₹' : '$'}${Number(item.price || 0).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${order.paymentCurrency === 'INR' ? '₹' : '$'}${Number((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
      </tr>
    `).join('')

    const symbol = order.paymentCurrency === 'INR' ? '₹' : '$'
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tax Invoice - ${order.orderNumber}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; background: #f4f6f9; }
          .invoice-box { max-width: 800px; margin: auto; padding: 30px; background: #fff; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1a237e; padding-bottom: 15px; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; color: #1a237e; }
          .invoice-title { font-size: 20px; font-weight: bold; color: #555; text-align: right; }
          .flex-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .col { flex: 1; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #1a237e; color: #fff; padding: 10px; text-align: left; }
          .totals { text-align: right; margin-top: 15px; }
          .totals table { width: 300px; margin-left: auto; }
          .totals td { padding: 6px; }
          .btn-print { background: #1a237e; color: #fff; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 20px; }
          @media print { .btn-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <div>
              <div class="logo">UBS GLOBAL</div>
              <div style="font-size: 12px; color: #666;">Global Marketplace & Logistics</div>
            </div>
            <div>
              <div class="invoice-title">TAX INVOICE</div>
              <div style="font-size: 12px; color: #666;">Order #: <strong>${order.orderNumber}</strong></div>
              <div style="font-size: 12px; color: #666;">Date: ${new Date(order.createdAt).toLocaleDateString()}</div>
            </div>
          </div>

          <div class="flex-grid">
            <div class="col">
              <strong>Seller Info:</strong><br>
              ${order.sellerId?.shopName || 'UBS Global Verified Seller'}<br>
              ${order.sellerId?.address || 'India'}<br>
              Email: ${order.sellerId?.email || 'seller@ubsglobal.com'}
            </div>
            <div class="col" style="text-align: right;">
              <strong>Billed To:</strong><br>
              ${order.deliveryAddress?.fullName || 'Customer'}<br>
              ${order.deliveryAddress?.street || ''}, ${order.deliveryAddress?.city || ''}<br>
              ${order.deliveryAddress?.state || ''} ${order.deliveryAddress?.zipCode || ''}, ${order.deliveryAddress?.country || ''}<br>
              Phone: ${order.deliveryAddress?.phone || ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr>
                <td>Subtotal:</td>
                <td><strong>${symbol}${Number(order.subtotal || 0).toFixed(2)}</strong></td>
              </tr>
              <tr>
                <td>Shipping Fee:</td>
                <td><strong>${order.shippingFee === 0 ? 'FREE' : `${symbol}${Number(order.shippingFee || 0).toFixed(2)}`}</strong></td>
              </tr>
              ${order.tax > 0 ? `<tr><td>Tax:</td><td><strong>${symbol}${Number(order.tax || 0).toFixed(2)}</strong></td></tr>` : ''}
              <tr style="border-top: 2px solid #1a237e; font-size: 16px; color: #1a237e;">
                <td><strong>Total:</strong></td>
                <td><strong>${symbol}${Number(order.grandTotal || 0).toFixed(2)}</strong></td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
          </div>
        </div>
      </body>
      </html>
    `
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  } catch (error) {
    res.status(500).send('<h2>Error loading invoice</h2>')
  }
}

/**
 * Render Official Shipping Label for Order
 */
exports.viewLabel = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id).populate('sellerId')
    if (!order) {
      return res.status(404).send('<h2>Order Not Found</h2>')
    }

    const awb = order.awbCode || order.trackingNumber || `UBS-${String(order._id).slice(-8).toUpperCase()}`
    const courier = order.courierName || 'Shiprocket Express'

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Shipping Label - ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f4f6f9; padding: 20px; }
          .label-card { max-width: 500px; margin: auto; background: #fff; border: 2px solid #000; padding: 20px; border-radius: 8px; }
          .top-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .courier { font-size: 18px; font-weight: bold; text-transform: uppercase; }
          .barcode-box { text-align: center; margin: 20px 0; padding: 15px; background: #f9f9f9; border: 1px dashed #666; }
          .awb { font-size: 22px; font-weight: bold; letter-spacing: 2px; }
          .address-section { border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px; font-size: 13px; line-height: 1.5; }
          .btn-print { background: #008b8b; color: #fff; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; display: block; margin: 20px auto 0; }
          @media print { .btn-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="label-card">
          <div class="top-row">
            <div>
              <div style="font-size: 10px; font-weight: bold;">DELIVERY PARTNER</div>
              <div class="courier">${courier}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px;">ORDER #</div>
              <div style="font-weight: bold;">${order.orderNumber}</div>
            </div>
          </div>

          <div class="barcode-box">
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">AIR WAYBILL (AWB) CODE</div>
            <div class="awb">${awb}</div>
            <div style="font-family: monospace; font-size: 14px; margin-top: 4px;">||||||||||||||||||||||||||||||||||||||||||||||</div>
          </div>

          <div class="address-section">
            <strong>SHIP TO:</strong><br>
            <strong>${order.deliveryAddress?.fullName || 'Recipient'}</strong><br>
            ${order.deliveryAddress?.street || ''}, ${order.deliveryAddress?.city || ''}<br>
            ${order.deliveryAddress?.state || ''} ${order.deliveryAddress?.zipCode || ''}, ${order.deliveryAddress?.country || ''}<br>
            Phone: ${order.deliveryAddress?.phone || ''}
          </div>

          <div class="address-section" style="background: #fafafa; padding: 8px; border-radius: 4px;">
            <strong>RETURN / SHIPPER ADDRESS:</strong><br>
            ${order.sellerId?.shopName || 'UBS Global Verified Seller'}<br>
            ${order.sellerId?.address || 'Warehouse Hub, India'}
          </div>

          <button class="btn-print" onclick="window.print()">Print Label</button>
        </div>
      </body>
      </html>
    `
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  } catch (error) {
    res.status(500).send('<h2>Error loading label</h2>')
  }
}