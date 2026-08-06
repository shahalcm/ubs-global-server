const mongoose = require('mongoose')
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
const { sendEmail } = require('../utils/sendEmail')
const shiprocketService = require('../services/shiprocket.service')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder'
})

// STEP 1: Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const {
      items,
      sellerId,
      deliveryAddress,
      cartId,
      sellerNote,
      shippingSpeed
    } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required'
      })
    }

    if (!deliveryAddress || typeof deliveryAddress !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required'
      })
    }

    const fullName = (deliveryAddress.fullName || deliveryAddress.name || '').trim()
    const phone = (deliveryAddress.phone || '').trim()
    const street = (deliveryAddress.street || '').trim()
    const city = (deliveryAddress.city || '').trim()
    const country = (deliveryAddress.country || '').trim()

    if (!fullName || !phone || !street || !city || !country) {
      return res.status(400).json({
        success: false,
        message: 'Full name, phone, street address, city, and country are required in delivery address'
      })
    }

    const formattedDeliveryAddress = {
      fullName,
      name: fullName,
      phone,
      email: (deliveryAddress.email || '').trim(),
      street,
      landmark: (deliveryAddress.landmark || '').trim(),
      city,
      state: (deliveryAddress.state || '').trim(),
      country,
      zipCode: (deliveryAddress.zipCode || '').trim(),
      deliveryInstructions: (deliveryAddress.deliveryInstructions || '').trim()
    }

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
        productImage: product.images?.[0] || product.image || '',
        productSku: product.sku || '',
        quantity: item.quantity,
        price: product.price,
        subtotal: itemSubtotal
      })
    }

    // Add express shipping fee if selected
    const chosenShippingSpeed = (shippingSpeed || 'standard').toLowerCase()
    if (chosenShippingSpeed === 'express') {
      shippingFee += 9.99
    }

    const tax = subtotal * 0.05
    const grandTotal = subtotal + shippingFee + tax

    // Commission calculation (3%)
    const commissionPercent = 3
    const commissionAmount = subtotal * (commissionPercent / 100)
    const sellerEarnings = subtotal
    const adminEarnings = commissionAmount

    const userCurrency = (req.body.currency || 'INR').toUpperCase()
    const reqAmount = Number(req.body.amount)
    const finalGrandTotal = reqAmount && !isNaN(reqAmount) && reqAmount > 0 ? reqAmount : grandTotal

    // Calculate INR equivalent for Razorpay API (Razorpay processes payments in INR paise)
    const grandTotalINR = userCurrency === 'INR' ? finalGrandTotal : finalGrandTotal * 87.0
    const amountInPaise = Math.round(grandTotalINR * 100)

    console.log('💳 [Backend Razorpay Order Debug]:', {
      selectedCountry: formattedDeliveryAddress?.country || 'Not specified',
      selectedCurrency: userCurrency,
      amountSentToBackend: finalGrandTotal.toFixed(2),
      amountInPaise,
      razorpayOrderCurrency: 'INR'
    })

    let targetSellerId = sellerId
    if (!targetSellerId || targetSellerId === 'unknown' || !mongoose.Types.ObjectId.isValid(targetSellerId)) {
      if (items[0]?.productId) {
        const firstProd = await Product.findById(items[0].productId)
        if (firstProd?.sellerId) {
          targetSellerId = firstProd.sellerId
        }
      }
    }

    if (!targetSellerId || targetSellerId === 'unknown' || !mongoose.Types.ObjectId.isValid(targetSellerId)) {
      const defaultSeller = await Seller.findOne({ status: 'approved' }) || await Seller.findOne()
      if (defaultSeller) {
        targetSellerId = defaultSeller._id
      } else {
        return res.status(400).json({
          success: false,
          message: 'A valid seller profile is required for order creation'
        })
      }
    }

    // Create Razorpay order (always in INR for Razorpay SDK compatibility)
    let razorpayOrder
    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'rzp_test_your_key_id' || process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder') {
      razorpayOrder = { id: `order_mock_${Date.now()}` }
    } else {
      try {
        razorpayOrder = await razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `receipt_${Date.now()}`,
          notes: {
            buyerId: req.user._id.toString(),
            sellerId: targetSellerId ? targetSellerId.toString() : ''
          }
        })
      } catch (rzpErr) {
        console.error('Razorpay SDK order creation error, falling back to mock:', rzpErr.message)
        razorpayOrder = { id: `order_mock_${Date.now()}` }
      }
    }

    // Create pending order in DB
    const order = await Order.create({
      buyerId: req.user._id,
      sellerId: targetSellerId,
      items: orderItems,
      subtotal: Number(subtotal.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      grandTotal: Number(finalGrandTotal.toFixed(2)),
      paymentMethod: 'razorpay',
      paymentCurrency: currency,
      paymentStatus: 'pending',
      razorpayOrderId: razorpayOrder.id,
      commissionPercent,
      commissionAmount: Number(commissionAmount.toFixed(2)),
      sellerEarnings: Number(sellerEarnings.toFixed(2)),
      adminEarnings: Number(adminEarnings.toFixed(2)),
      deliveryAddress: formattedDeliveryAddress,
      sellerNote: (sellerNote || '').trim(),
      shippingSpeed: chosenShippingSpeed,
      timeline: [{
        status: 'placed',
        timestamp: new Date(),
        note: 'Order created, payment pending'
      }]
    })

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      userCurrency,
      orderId: order._id,
      orderNumber: order.orderNumber,
      key: process.env.RAZORPAY_KEY_ID,
      prefill: {
        name: formattedDeliveryAddress.fullName || req.user.name,
        email: formattedDeliveryAddress.email || req.user.email,
        contact: formattedDeliveryAddress.phone || req.user.phone
      },
      orderSummary: {
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        tax: tax.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        deliveryAddress: formattedDeliveryAddress,
        currency
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
    const isMockVerification =
      (razorpayOrderId && razorpayOrderId.startsWith('order_mock_')) ||
      (razorpayPaymentId && razorpayPaymentId.startsWith('pay_mock_')) ||
      (razorpaySignature && razorpaySignature.startsWith('sig_mock_'))

    if (isMockVerification) {
      console.log('ℹ️ Mock/Development payment signature verification accepted for order:', orderId)
    } else {
      const body = razorpayOrderId + '|' + razorpayPaymentId
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret')
        .update(body.toString())
        .digest('hex')

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed: Invalid signature'
        })
      }
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
     .populate('sellerId', 'shopName ownerName email userId fcmToken')

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

    // Notify seller - new order via Socket.io
    if (global.io) {
      const payload = {
        orderId: order._id,
        orderNumber: order.orderNumber,
        buyerName: order.buyerId.name,
        amount: order.grandTotal,
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        message: 'New order received!'
      }

      global.io.to(order.sellerId._id.toString()).emit('newOrder', payload)
      if (order.sellerId.userId) {
        global.io.to(order.sellerId.userId.toString()).emit('newOrder', payload)
      }

      // Notify admin
      global.io.to('admin-room').emit('paymentReceived', {
        orderId: order._id,
        amount: order.grandTotal,
        commission: order.commissionAmount,
        buyerName: order.buyerId.name,
        sellerShop: order.sellerId.shopName
      })
    }

    // Create notifications for Seller and Buyer
    const notificationDocs = [
      {
        userId: order.sellerId._id,
        userType: 'Seller',
        title: '🛍️ New Order Received!',
        message: `Order #${order.orderNumber} from ${order.buyerId.name} - ${order.grandTotal}`,
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
    ]

    if (order.sellerId.userId) {
      notificationDocs.push({
        userId: order.sellerId.userId,
        userType: 'User',
        title: '🛍️ New Order Received!',
        message: `Order #${order.orderNumber} from ${order.buyerId.name} - ${order.grandTotal}`,
        type: 'order',
        data: { orderId: order._id }
      })
    }

    await Notification.create(notificationDocs)

    // Send email alert to seller
    try {
      const sellerEmail = order.sellerId?.email
      if (sellerEmail) {
        const itemsListHtml = order.items.map(i => `<li><strong>${i.productName}</strong> x ${i.quantity} — ${i.price} each</li>`).join('')
        const addr = order.deliveryAddress || {}
        const addressHtml = `
          <p><strong>Full Name:</strong> ${addr.fullName || order.buyerId.name}</p>
          <p><strong>Phone:</strong> ${addr.phone || order.buyerId.phone || 'N/A'}</p>
          <p><strong>Email:</strong> ${addr.email || order.buyerId.email || 'N/A'}</p>
          <p><strong>Address:</strong> ${addr.street || ''}, ${addr.landmark ? addr.landmark + ', ' : ''}${addr.city || ''}, ${addr.state || ''}, ${addr.country || ''} - ${addr.zipCode || ''}</p>
        `
        await sendEmail({
          to: sellerEmail,
          subject: `🛍️ New Order Received: #${order.orderNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 16px; color: #333;">
              <h2 style="color: #1a237e;">New Order Received on UBS Global!</h2>
              <p>Hi <strong>${order.sellerId.ownerName || order.sellerId.shopName}</strong>,</p>
              <p>Great news! You have received a new order <strong>#${order.orderNumber}</strong> for total <strong>${order.grandTotal}</strong>.</p>
              <hr style="border: 0; border-top: 1px solid #e0e0e0;" />
              <h3 style="color: #1a237e;">Ordered Items</h3>
              <ul>${itemsListHtml}</ul>
              <hr style="border: 0; border-top: 1px solid #e0e0e0;" />
              <h3 style="color: #1a237e;">Customer Contact & Shipping Location</h3>
              ${addressHtml}
              ${order.sellerNote ? `<p><strong>Order Note:</strong> ${order.sellerNote}</p>` : ''}
              <hr style="border: 0; border-top: 1px solid #e0e0e0;" />
              <p>Please log in to your UBS Global Seller Portal to fulfill this order.</p>
            </div>
          `
        })
      }
    } catch (emailErr) {
      console.log('Error sending seller order notification email:', emailErr.message)
    }

    // Trigger automated Shiprocket pipeline (Create Order, Assign AWB, Generate Pickup)
    (async () => {
      try {
        const seller = await Seller.findById(order.sellerId._id)
        if (seller) {
          const defaultPickup = seller.pickupAddresses?.find(p => p.isDefault) || seller.pickupAddresses?.[0]
          const pickupLocationTag = defaultPickup?.pickup_location || seller.shopName.toLowerCase().replace(/[^a-z0-9]/g, '_')
          const orderItems = order.items.map(i => ({
            name: i.productName,
            sku: i.productSku || `SKU-${i.productId}`,
            units: i.quantity,
            selling_price: i.price,
            discount: 0, tax: 0, hsn: 0
          }))
          const srPayload = {
            order_id: order.orderNumber,
            order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
            pickup_location: pickupLocationTag,
            comment: order.sellerNote || 'UBS Global Order',
            billing_customer_name: order.deliveryAddress?.fullName || order.buyerId.name || 'Customer',
            billing_address: order.deliveryAddress?.street || 'Main Street',
            billing_city: order.deliveryAddress?.city || 'Delhi',
            billing_pincode: order.deliveryAddress?.zipCode || '110001',
            billing_state: order.deliveryAddress?.state || 'Delhi',
            billing_country: order.deliveryAddress?.country || 'India',
            billing_email: order.deliveryAddress?.email || order.buyerId.email || 'customer@ubsglobal.com',
            billing_phone: order.deliveryAddress?.phone || order.buyerId.phone || '9999999999',
            shipping_is_billing: true,
            order_items: orderItems,
            payment_method: 'Prepaid',
            sub_total: order.subtotal,
            length: 10, width: 10, height: 10, weight: 0.5
          }
          const srRes = await shiprocketService.createOrder(srPayload)
          if (srRes?.order_id) {
            order.shiprocketOrderId = String(srRes.order_id)
            order.shiprocketShipmentId = String(srRes.shipment_id)
            if (srRes.shipment_id) {
              const awbRes = await shiprocketService.assignAWB({ shipment_id: srRes.shipment_id }).catch(e => console.warn('AWB assign:', e.message))
              if (awbRes?.response?.data?.awb_code) {
                order.awbCode = awbRes.response.data.awb_code
                order.courierName = awbRes.response.data.courier_name || 'Shiprocket Courier'
              }
              await shiprocketService.generatePickup({ shipment_id: srRes.shipment_id }).catch(e => console.warn('Pickup gen:', e.message))
              const labelRes = await shiprocketService.generateLabel({ shipment_id: srRes.shipment_id }).catch(e => null)
              if (labelRes?.label_url) order.labelUrl = labelRes.label_url
              const invRes = await shiprocketService.printInvoice({ ids: [srRes.order_id] }).catch(e => null)
              if (invRes?.invoice_url) order.invoiceUrl = invRes.invoice_url
            }
            await order.save()
          }
        }
      } catch (srErr) {
        console.error('⚠️ Post-payment Shiprocket pipeline error:', srErr.message)
      }
    })()

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

    const withdrawalRequests = await Withdrawal.find()
      .populate('sellerId', 'shopName')
      .sort({ createdAt: -1 })

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

exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, adminNote } = req.body

    if (!['completed', 'rejected', 'processing'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      })
    }

    const withdrawal = await Withdrawal.findById(id)
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal request not found'
      })
    }

    if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal request is already processed'
      })
    }

    if (status === 'completed' && withdrawal.type === 'seller') {
      const seller = await Seller.findById(withdrawal.sellerId)
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        })
      }

      if (seller.pendingWithdrawal < withdrawal.amount) {
        return res.status(400).json({
          success: false,
          message: 'Seller has insufficient pending balance to complete this withdrawal'
        })
      }

      // Deduct from pending and move to withdrawn
      seller.pendingWithdrawal -= withdrawal.amount
      seller.withdrawnAmount = (seller.withdrawnAmount || 0) + withdrawal.amount
      await seller.save()
    }

    withdrawal.status = status
    withdrawal.adminNote = adminNote || ''
    withdrawal.processedAt = new Date()
    if (status === 'completed') {
      withdrawal.completedAt = new Date()
    }
    await withdrawal.save()

    res.json({
      success: true,
      message: `Withdrawal request marked as ${status} successfully`,
      withdrawal
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}