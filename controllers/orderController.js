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
 * Track Order Details
 */
exports.trackOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('sellerId', 'shopName ownerName phone email address pickupAddresses')

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    // Optionally sync live tracking if AWB exists
    if (order.awbCode) {
      try {
        const liveTracking = await shiprocketService.trackShipment(order.awbCode)
        if (liveTracking?.tracking_data?.shipment_track_activities) {
          order.trackingEvents = liveTracking.tracking_data.shipment_track_activities.map(act => ({
            activity: act.activity || act.sr_status_label,
            location: act.location || '',
            date: act.date || '',
            time: act.time || '',
            status: act.sr_status_label || act.activity,
            sr_status: act.sr_status || '',
            timestamp: new Date()
          }))
          await order.save()
        }
      } catch (e) {
        console.warn('Live tracking fetch failed:', e.message)
      }
    }

    res.json({ success: true, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
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
 * Manual Trigger: Generate Label & Download Link
 */
exports.generateLabel = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order || !order.shiprocketShipmentId) {
      return res.status(400).json({ success: false, message: 'Order or Shiprocket shipment ID not found' })
    }

    const labelUrl = await shiprocketService.downloadLabel(order.shiprocketShipmentId)
    if (labelUrl) {
      order.labelUrl = labelUrl
      await order.save()
    }

    res.json({ success: true, labelUrl, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Manual Trigger: Generate Invoice & Download Link
 */
exports.generateInvoice = async (req, res) => {
  try {
    const { id } = req.params
    const order = await Order.findById(id)
    if (!order || !order.shiprocketOrderId) {
      return res.status(400).json({ success: false, message: 'Order or Shiprocket order ID not found' })
    }

    const invRes = await shiprocketService.generateInvoice([order.shiprocketOrderId])
    if (invRes?.invoice_url) {
      order.invoiceUrl = invRes.invoice_url
      await order.save()
    }

    res.json({ success: true, invoiceUrl: order.invoiceUrl || invRes?.invoice_url, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}