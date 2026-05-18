const mongoose = require('mongoose')
const User = require('../models/User')
const Seller = require('../models/Seller')
const Product = require('../models/Product')
const ContactRequest = require('../models/ContactRequest')
const Notification = require('../models/Notification')
const { sendEmail } = require('../utils/sendEmail')
const { sendPushNotification, createInAppNotification } = require('../utils/notifications')

exports.createRequest = async (req, res) => {
  try {
    const {
      sellerId,
      productId,
      subject,
      message,
      requestType,
      quantity,
      budget,
      isUrgent,
      isBulkOrder
    } = req.body

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: 'Invalid seller id' })
    }

    const seller = await Seller.findById(sellerId)
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' })
    }

    const product = productId && mongoose.Types.ObjectId.isValid(productId)
      ? await Product.findById(productId)
      : null

    const buyer = await User.findById(req.user.id)
    if (!buyer) {
      return res.status(404).json({ success: false, message: 'Buyer not found' })
    }

    const request = await ContactRequest.create({
      buyerId: req.user.id,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
      sellerId,
      sellerName: seller.ownerName,
      sellerShop: seller.shopName,
      productId,
      productName: product?.title,
      productImage: product?.images?.[0] || seller.shopLogo,
      subject,
      message,
      requestType,
      quantity,
      budget,
      isUrgent: Boolean(isUrgent),
      isBulkOrder: Boolean(isBulkOrder)
    })

    if (global.io) {
      global.io.to('admin-room').emit('newContactRequest', {
        requestId: request._id,
        buyerName: buyer.name,
        sellerShop: seller.shopName,
        productName: product?.title || request.productName,
        isUrgent: Boolean(isUrgent)
      })
    }

    await createInAppNotification({
      userType: 'Admin',
      title: 'New contact request',
      message: `${buyer.name} requested to connect with ${seller.shopName}`,
      type: 'contact_request',
      data: { requestId: request._id }
    })

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: 'New Buyer-Seller Contact Request',
      html: `<p><strong>${buyer.name}</strong> wants to contact <strong>${seller.shopName}</strong>.</p><p>Subject: ${subject}</p><p>Message: ${message}</p>`
    })

    res.status(201).json({
      success: true,
      message: 'Request sent! Admin will review and connect you shortly.',
      request
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getMyRequests = async (req, res) => {
  try {
    const requests = await ContactRequest.find({ buyerId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('productId', 'title images price')
      .populate('sellerId', 'shopName ownerName shopLogo')

    res.json({ success: true, requests })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getRequestById = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request id' })
    }

    const request = await ContactRequest.findById(id)
      .populate('productId', 'title images price')
      .populate('sellerId', 'shopName ownerName shopLogo')
      .populate('buyerId', 'name email phone')

    if (!request) {
      return res.status(404).json({ success: false, message: 'Contact request not found' })
    }

    if (request.buyerId._id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    res.json({ success: true, request })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
