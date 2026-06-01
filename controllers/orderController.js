const Order = require('../models/Order')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Transaction = require('../models/Transaction')

exports.placeOrder = async (req, res) => {
  const {
    items, sellerId, deliveryAddress,
    paymentMethod, paymentIntentId
  } = req.body

  let totalAmount = 0
  let shippingFee = 0
  const orderItems = []

  for (const item of items) {
    const product = await Product.findById(item.productId)
    if (!product) continue
    const subtotal = product.price * item.quantity
    totalAmount += subtotal
    shippingFee += product.freeShipping ? 0 : product.shippingFee
    orderItems.push({
      productId: product._id,
      productName: product.title,
      productImage: product.images[0],
      quantity: item.quantity,
      price: product.price,
      subtotal
    })
    product.stock -= item.quantity
    product.totalSales += item.quantity
    await product.save()
  }

  const tax = totalAmount * 0.05
  const grandTotal = totalAmount + shippingFee + tax
  const seller = await Seller.findById(sellerId)
  const commissionRate = 3
  const commission = Number((totalAmount * (commissionRate / 100)).toFixed(2))
  const sellerEarnings = Number(totalAmount.toFixed(2))
  const adminEarnings = commission

  const order = await Order.create({
    buyerId: req.user._id,
    sellerId,
    items: orderItems,
    subtotal: totalAmount,
    shippingFee,
    tax,
    grandTotal,
    paymentMethod,
    paymentIntentId,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    deliveryAddress,
    commissionPercent: commissionRate,
    commissionAmount: commission,
    sellerEarnings,
    adminEarnings,
    timeline: [{ status: 'placed', timestamp: new Date() }]
  })

  await Transaction.create({
    orderId: order._id,
    sellerId,
    buyerId: req.user._id,
    grossAmount: grandTotal,
    commissionPercent: commissionRate,
    commissionAmount: commission,
    sellerEarnings,
    adminEarnings,
    paymentMethod,
    status: order.paymentStatus === 'paid' ? 'completed' : 'pending'
  })

  io.to(sellerId.toString()).emit('newOrder', {
    orderId: order._id,
    buyerName: req.user.name,
    amount: grandTotal
  })

  res.status(201).json({ success: true, order })
}

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id })
      .populate('sellerId', 'shopName shopLogo')
      .sort({ createdAt: -1 })
    res.json({ success: true, orders })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.trackOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('sellerId', 'shopName ownerName phone')
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    res.json({ success: true, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getSellerOrders = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id })
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller profile not found' })
    }

    const { status } = req.query
    let query = { sellerId: seller._id }
    if (status && status !== 'All') {
      query.orderStatus = status.toLowerCase()
    }

    const orders = await Order.find(query)
      .populate('buyerId', 'name email')
      .sort({ createdAt: -1 })

    res.json({ success: true, orders })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

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
      order.paymentStatus = 'paid'
    }

    await order.save()

    res.json({ success: true, order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const order = await Order.findById(id)
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    // Verify authorized user
    if (order.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorized to cancel this order' })
    }

    // Verify cancellable status
    const cancellableStatuses = ['placed', 'confirmed', 'packed']
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order status is '${order.orderStatus}'. Only orders in 'placed', 'confirmed', or 'packed' status can be cancelled.`
      })
    }

    // Update status and timeline
    order.orderStatus = 'cancelled'
    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: reason || 'Order cancelled by buyer.'
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

    // Update Transaction status if exists
    const transaction = await Transaction.findOne({ orderId: order._id })
    if (transaction) {
      transaction.status = order.paymentStatus === 'paid' ? 'refunded' : 'failed'
      await transaction.save()
    }

    await order.save()

    // Emit Socket.io notifications
    if (global.io) {
      // Emit to seller ID room (from seller context)
      global.io.to(order.sellerId.toString()).emit('orderStatusChanged', {
        orderId: order._id,
        status: 'cancelled'
      })

      // Emit to seller's owner user ID room
      const seller = await Seller.findById(order.sellerId)
      if (seller && seller.userId) {
        global.io.to(seller.userId.toString()).emit('orderStatusChanged', {
          orderId: order._id,
          status: 'cancelled'
        })
      }

      // Emit to admin room
      global.io.to('admin-room').emit('orderStatusChanged', {
        orderId: order._id,
        status: 'cancelled'
      })
    }

    res.json({ success: true, message: 'Order cancelled successfully', order })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}