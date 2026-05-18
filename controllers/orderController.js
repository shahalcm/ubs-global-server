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
  const commissionRate = seller.commission || 8
  const commission = grandTotal * (commissionRate / 100)
  const sellerEarnings = grandTotal - commission

  const order = await Order.create({
    buyerId: req.user._id,
    sellerId,
    items: orderItems,
    totalAmount,
    shippingFee,
    tax,
    grandTotal,
    paymentMethod,
    paymentIntentId,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    deliveryAddress,
    commission,
    sellerEarnings,
    timeline: [{ status: 'placed', timestamp: new Date() }]
  })

  await Transaction.create({
    orderId: order._id,
    sellerId,
    buyerId: req.user._id,
    grossAmount: grandTotal,
    commission,
    commissionRate,
    netAmount: sellerEarnings,
    paymentMethod,
    status: 'pending'
  })

  io.to(sellerId.toString()).emit('newOrder', {
    orderId: order._id,
    buyerName: req.user.name,
    amount: grandTotal
  })

  res.status(201).json({ success: true, order })
}