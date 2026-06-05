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

    let seller = null
    if (sellerId) {
      if (!mongoose.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ success: false, message: 'Invalid seller id' })
      }
      seller = await Seller.findById(sellerId)
      if (!seller) {
        return res.status(404).json({ success: false, message: 'Seller not found' })
      }
    }

    const product = productId && mongoose.Types.ObjectId.isValid(productId)
      ? await Product.findById(productId)
      : null

    const buyer = await User.findById(req.user.id)
    if (!buyer) {
      return res.status(404).json({ success: false, message: 'Buyer not found' })
    }

    const targetShopName = seller ? seller.shopName : 'UBS Global Admin Panel'
    const targetOwnerName = seller ? seller.ownerName : 'Admin'
    const targetImage = product?.images?.[0] || (seller ? seller.shopLogo : 'https://images.unsplash.com/photo-1557200134-90327ee9fafa?w=100&q=80')

    const request = await ContactRequest.create({
      buyerId: req.user.id,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
      sellerId: sellerId || null,
      sellerName: targetOwnerName,
      sellerShop: targetShopName,
      productId: productId || null,
      productName: product?.title,
      productImage: targetImage,
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
        sellerShop: targetShopName,
        productName: product?.title || request.productName,
        isUrgent: Boolean(isUrgent)
      })
    }

    await createInAppNotification({
      userType: 'Admin',
      title: seller ? 'New contact request' : 'New support inquiry',
      message: seller 
        ? `${buyer.name} requested to connect with ${seller.shopName}`
        : `${buyer.name} sent an inquiry to UBS Admin Panel`,
      type: 'contact_request',
      data: { requestId: request._id }
    })

    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: seller ? 'New Buyer-Seller Contact Request' : 'New Support Inquiry to Admin Panel',
      html: seller 
        ? `<p><strong>${buyer.name}</strong> wants to contact <strong>${seller.shopName}</strong>.</p><p>Subject: ${subject}</p><p>Message: ${message}</p>`
        : `<p><strong>${buyer.name}</strong> sent an inquiry regarding <strong>${product?.title || 'Service Portal'}</strong>.</p><p>Subject: ${subject}</p><p>Message: ${message}</p>`
    })

    res.status(201).json({
      success: true,
      message: seller 
        ? 'Request sent! Admin will review and connect you shortly.'
        : 'Inquiry sent! Admin will review and get in touch shortly.',
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
