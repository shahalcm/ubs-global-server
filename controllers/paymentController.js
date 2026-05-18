const Razorpay = require('razorpay')
const crypto = require('crypto')
const Order = require('../models/Order')
const Transaction = require('../models/Transaction')
const Cart = require('../models/Cart')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const User = require('../models/User')
const Notification = require('../models/Notification')
const Withdrawal = require('../models/Withdrawal')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

// STEP 1: Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const {
      items,
      sellerId,
      deliveryAddress,
      cartId
    } = req.body

    // Calculate amounts
    let subtotal = 0
    let shippingFee = 0
    const orderItems = []

    for (const item of items) {
      const product = await Product.findById(
        item.productId
      )
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product?.title || 'A product'} is out of stock`
        })
      }

      const itemSubtotal = product.price * item.quantity
      subtotal += itemSubtotal

      if (!product.freeShipping) {
        shippingFee += product.shippingFee || 0
      }

      orderItems.push({
        productId: product._id,
        productName: product.title,
        productImage: product.images[0],
        productSku: product.sku,
        quantity: item.quantity,
        price: product.price,
        subtotal: itemSubtotal
      })
    }

    const tax = subtotal * 0.05
    const grandTotal = subtotal + shippingFee + tax

    // Commission calculation (3%)
    const commissionPercent = Number(
      process.env.PLATFORM_COMMISSION_PERCENT || 3
    )
    const commissionAmount = grandTotal *
      (commissionPercent / 100)
    const sellerEarnings = grandTotal - commissionAmount
    const adminEarnings = commissionAmount

    // Convert to paise (Razorpay uses smallest currency unit)
    // USD: amount in cents (1 USD = 100 cents)
    const amountInCents = Math.round(grandTotal * 100)

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInCents,
      currency: 'USD',
      receipt: `receipt_${Date.now()}`,
      notes: {
        buyerId: req.user._id.toString(),
        sellerId: sellerId
      }
    })

    // Create pending order in DB
    const order = await Order.create({
      buyerId: req.user._id,
      sellerId,
      items: orderItems,
      subtotal: Number(subtotal.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      razorpayOrderId: razorpayOrder.id,
      commissionPercent,
      commissionAmount: Number(commissionAmount.toFixed(2)),
      sellerEarnings: Number(sellerEarnings.toFixed(2)),
      adminEarnings: Number(adminEarnings.toFixed(2)),
      deliveryAddress,
      timeline: [{
        status: 'placed',
        timestamp: new Date(),
        note: 'Order created, payment pending'
      }]
    })

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInCents,
      currency: 'USD',
      orderId: order._id,
      orderNumber: order.orderNumber,
      key: process.env.RAZORPAY_KEY_ID,
      prefill: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone
      },
      orderSummary: {
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        tax: tax.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        deliveryAddress
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// STEP 2: Verify payment after success
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      orderId
    } = req.body

    // Verify signature
    const body = razorpayOrderId + '|' + razorpayPaymentId
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex')

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      })
    }

    // Update order
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: 'paid',
        orderStatus: 'placed',
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
        $push: {
          timeline: {
            status: 'paid',
            timestamp: new Date(),
            note: 'Payment received successfully'
          }
        }
      },
      { new: true }
    ).populate('buyerId', 'name email phone')
     .populate('sellerId', 'shopName ownerName fcmToken')

    // Reduce stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: -item.quantity,
            totalSales: item.quantity
          }
        }
      )
    }

    // Update seller stats
    await Seller.findByIdAndUpdate(
      order.sellerId._id,
      {
        $inc: {
          totalSales: 1,
          totalRevenue: order.sellerEarnings,
          pendingWithdrawal: order.sellerEarnings
        }
      }
    )

    // Create transaction record
    await Transaction.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      sellerId: order.sellerId._id,
      buyerId: req.user._id,
      grossAmount: order.grandTotal,
      commissionPercent: order.commissionPercent,
      commissionAmount: order.commissionAmount,
      sellerEarnings: order.sellerEarnings,
      adminEarnings: order.adminEarnings,
      paymentMethod: 'razorpay',
      razorpayPaymentId,
      currency: 'USD',
      status: 'completed',
      paidAt: new Date()
    })

    // Clear buyer cart
    await Cart.findOneAndUpdate(
      { buyerId: req.user._id },
      { items: [] }
    )

    // Notify seller - new order
    if (global.io) {
      global.io.to(order.sellerId._id.toString()).emit(
        'newOrder',
        {
          orderId: order._id,
          orderNumber: order.orderNumber,
          buyerName: order.buyerId.name,
          amount: order.grandTotal,
          items: order.items,
          message: 'New order received!'
        }
      )

      // Notify admin
      global.io.to('admin-room').emit('paymentReceived', {
        orderId: order._id,
        amount: order.grandTotal,
        commission: order.commissionAmount,
        buyerName: order.buyerId.name,
        sellerShop: order.sellerId.shopName
      })
    }

    // Create notifications
    await Notification.create([
      {
        userId: order.sellerId._id,
        userType: 'Seller',
        title: '🛍️ New Order Received!',
        message: `Order #${order.orderNumber} from ${order.buyerId.name} - $${order.grandTotal}`,
        type: 'order',
        data: { orderId: order._id }
      },
      {
        userId: req.user._id,
        userType: 'User',
        title: '✅ Order Placed Successfully!',
        message: `Your order #${order.orderNumber} has been placed`,
        type: 'order',
        data: { orderId: order._id }
      }
    ])

    res.json({
      success: true,
      message: 'Payment verified and order placed!',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        grandTotal: order.grandTotal,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Seller: Get earnings breakdown
exports.getSellerEarnings = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      sellerId: req.seller._id,
      status: 'completed'
    })
      .populate('orderId', 'orderNumber items deliveryAddress')
      .populate('buyerId', 'name email phone avatar')
      .sort({ createdAt: -1 })

    const seller = await Seller.findById(req.seller._id)
      .select('totalRevenue pendingWithdrawal withdrawnAmount')

    const totalEarnings = transactions.reduce(
      (sum, t) => sum + t.sellerEarnings, 0
    )
    const totalCommissionPaid = transactions.reduce(
      (sum, t) => sum + t.commissionAmount, 0
    )

    res.json({
      success: true,
      earnings: {
        totalEarnings: totalEarnings.toFixed(2),
        pendingWithdrawal: seller.pendingWithdrawal || 0,
        withdrawnAmount: seller.withdrawnAmount || 0,
        totalCommissionPaid: totalCommissionPaid.toFixed(2)
      },
      transactions
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Seller: Request withdrawal
exports.sellerWithdrawal = async (req, res) => {
  try {
    const { amount, bankDetails } = req.body
    const seller = await Seller.findById(req.seller._id)

    if (amount > seller.pendingWithdrawal) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      })
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create({
      sellerId: req.seller._id,
      amount,
      bankDetails: bankDetails || seller.bankDetails,
      status: 'pending',
      type: 'seller'
    })

    // Notify admin
    if (global.io) {
      global.io.to('admin-room').emit(
        'newWithdrawalRequest',
        {
          withdrawalId: withdrawal._id,
          sellerName: seller.shopName,
          amount,
          type: 'seller'
        }
      )
    }

    res.json({
      success: true,
      message: 'Withdrawal request submitted',
      withdrawal
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Admin: Get commissions
exports.getAdminCommissions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      status: 'completed'
    })
      .populate('sellerId', 'shopName ownerName')
      .populate('buyerId', 'name email')
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })

    const totalCommissions = transactions.reduce(
      (sum, t) => sum + t.adminEarnings, 0
    )

    const withdrawalRequests = await Withdrawal.find({
      status: 'pending'
    }).populate('sellerId', 'shopName')

    res.json({
      success: true,
      totalCommissions: totalCommissions.toFixed(2),
      transactions,
      withdrawalRequests
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Admin: Withdraw to bank
exports.adminWithdrawal = async (req, res) => {
  try {
    const { amount } = req.body
    // In production connect to bank API
    // For now create withdrawal record
    const withdrawal = await Withdrawal.create({
      amount,
      type: 'admin',
      status: 'completed',
      completedAt: new Date()
    })

    res.json({
      success: true,
      message: 'Admin withdrawal processed',
      withdrawal
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getPaymentHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ buyerId: req.user._id, status: 'completed' }).populate('orderId', 'orderNumber').sort({ createdAt: -1 });
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}