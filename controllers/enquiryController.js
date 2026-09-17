const DirectEnquiry = require('../models/DirectEnquiry')
const EnquiryMessage = require('../models/EnquiryMessage')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Order = require('../models/Order')
const User = require('../models/User')
const { createInAppNotification, sendPushNotification } = require('../utils/notifications')

// Generate random friendly enquiry number
const generateEnquiryNumber = () => {
  const timestamp = Date.now().toString().slice(-6)
  const randomSuffix = Math.floor(100 + Math.random() * 900)
  return `ENQ-${timestamp}${randomSuffix}`
}

/**
 * @desc Create a new direct enquiry (Buyer only)
 * @route POST /api/enquiries
 */
exports.createEnquiry = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      unit,
      variant,
      targetPrice,
      deliveryLocation,
      requiredDeliveryDate,
      initialMessage,
      attachments
    } = req.body

    // Validation
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' })
    }
    const qty = Number(quantity)
    if (!qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be greater than zero' })
    }
    if (!deliveryLocation || !deliveryLocation.trim()) {
      return res.status(400).json({ success: false, message: 'Delivery location is required' })
    }
    if (!initialMessage || !initialMessage.trim()) {
      return res.status(400).json({ success: false, message: 'Initial requirement message is required' })
    }

    // Verify product exists and get internal seller reference
    const product = await Product.findById(productId).select('title images price sellerId storeId category unit')
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    // Seller is stored for internal admin context/sourcing
    const sellerId = product.sellerId || product.storeId || undefined

    // Safe delivery date parsing
    let parsedDeliveryDate = undefined
    if (requiredDeliveryDate) {
      const d = new Date(requiredDeliveryDate)
      if (!isNaN(d.getTime())) {
        parsedDeliveryDate = d
      }
    }

    // Safe target price
    const parsedTargetPrice = targetPrice && !isNaN(Number(targetPrice)) ? Number(targetPrice) : undefined

    const enquiryNumber = generateEnquiryNumber()

    const enquiry = await DirectEnquiry.create({
      enquiryNumber,
      buyerId: req.user._id,
      productId: product._id,
      sellerId: sellerId, // Seller is stored ONLY for internal admin context
      quantity: qty,
      unit: unit || product.unit || 'pieces',
      variant: variant ? String(variant).trim() : '',
      targetPrice: parsedTargetPrice,
      deliveryLocation: deliveryLocation.trim(),
      requiredDeliveryDate: parsedDeliveryDate,
      initialMessage: initialMessage.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      status: 'PENDING',
      lastMessage: initialMessage.trim(),
      lastMessageAt: new Date(),
      lastMessageBy: 'buyer',
      adminUnreadCount: 1,
      auditLog: [{
        action: 'ENQUIRY_CREATED',
        performedBy: 'buyer',
        performedById: req.user._id.toString(),
        details: { quantity: qty, deliveryLocation }
      }]
    })

    // Create the first message in EnquiryMessage
    await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'buyer',
      senderId: req.user._id,
      senderName: req.user.name || 'Buyer',
      senderAvatar: req.user.avatar || '',
      messageType: 'text',
      text: initialMessage.trim(),
      attachments: Array.isArray(attachments) ? attachments : []
    })

    // Populate product details for response
    const populatedEnquiry = await DirectEnquiry.findById(enquiry._id)
      .populate('productId', 'title images price category unit')
      .populate('sellerId', 'shopName shopLogo')

    // Real-time notification to all active Admins via Socket
    if (global.io) {
      global.io.to('admin-room').emit('direct-enquiry:created', {
        enquiryId: enquiry._id,
        enquiryNumber: enquiry.enquiryNumber,
        buyerName: req.user.name,
        productTitle: product.title,
        quantity: qty
      })
    }

    // In-app notification for admin dashboard (safe non-blocking)
    try {
      await createInAppNotification({
        userType: 'Admin',
        title: 'New Direct Enquiry',
        message: `${req.user.name || 'A buyer'} submitted an enquiry for ${qty}x ${product.title}`,
        type: 'direct_enquiry',
        data: { enquiryId: enquiry._id }
      })
    } catch (notifErr) {
      console.warn('In-app notification non-fatal error:', notifErr.message)
    }

    res.status(201).json({
      success: true,
      message: 'Direct enquiry submitted successfully',
      enquiry: populatedEnquiry
    })
  } catch (error) {
    console.error('createEnquiry error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to create enquiry' })
  }
}

/**
 * @desc Get buyer's direct enquiries (Buyer only)
 * @route GET /api/enquiries/my
 */
exports.getMyEnquiries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    const status = req.query.status

    const query = { buyerId: req.user._id }
    if (status && status !== 'ALL') {
      query.status = status
    }

    const [enquiries, total] = await Promise.all([
      DirectEnquiry.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('productId', 'title images price category unit')
        .populate('sellerId', 'shopName shopLogo')
        .lean(),
      DirectEnquiry.countDocuments(query)
    ])

    res.json({
      success: true,
      enquiries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('getMyEnquiries error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch enquiries' })
  }
}

/**
 * @desc Get single enquiry detail (Buyer only, strict ownership check)
 * @route GET /api/enquiries/:id
 */
exports.getEnquiryById = async (req, res) => {
  try {
    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('productId', 'title images price description category unit')
      .populate('sellerId', 'shopName shopLogo')

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    // IDOR Protection: Must match buyerId
    if (enquiry.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied to this enquiry' })
    }

    // Reset buyer unread counter
    if (enquiry.buyerUnreadCount > 0) {
      enquiry.buyerUnreadCount = 0
      await enquiry.save()
    }

    res.json({
      success: true,
      enquiry
    })
  } catch (error) {
    console.error('getEnquiryById error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch enquiry' })
  }
}

/**
 * @desc Get messages for enquiry (Buyer only, marks admin messages read)
 * @route GET /api/enquiries/:id/messages
 */
exports.getEnquiryMessages = async (req, res) => {
  try {
    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    if (enquiry.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const messages = await EnquiryMessage.find({ enquiryId: enquiry._id })
      .sort({ createdAt: 1 })
      .lean()

    // Mark unread admin messages as read by buyer
    await EnquiryMessage.updateMany(
      { enquiryId: enquiry._id, senderType: 'admin', isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    )

    if (enquiry.buyerUnreadCount > 0) {
      await DirectEnquiry.findByIdAndUpdate(enquiry._id, { buyerUnreadCount: 0 })
    }

    res.json({
      success: true,
      messages
    })
  } catch (error) {
    console.error('getEnquiryMessages error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch messages' })
  }
}

/**
 * @desc Send a message in direct enquiry (Buyer only)
 * @route POST /api/enquiries/:id/messages
 */
exports.sendEnquiryMessage = async (req, res) => {
  try {
    const { text, attachments } = req.body

    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    if (enquiry.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    if (enquiry.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: 'This enquiry is closed. Cannot send further messages.' })
    }

    if ((!text || !text.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ success: false, message: 'Message text or attachment is required' })
    }

    const message = await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'buyer',
      senderId: req.user._id,
      senderName: req.user.name || 'Buyer',
      senderAvatar: req.user.avatar || '',
      messageType: attachments && attachments.length > 0 ? 'image' : 'text',
      text: (text || '').trim(),
      attachments: Array.isArray(attachments) ? attachments : []
    })

    // Advance status to IN_DISCUSSION if currently PENDING
    const newStatus = enquiry.status === 'PENDING' ? 'IN_DISCUSSION' : enquiry.status

    await DirectEnquiry.findByIdAndUpdate(enquiry._id, {
      lastMessage: (text || 'Attachment sent').trim(),
      lastMessageAt: new Date(),
      lastMessageBy: 'buyer',
      status: newStatus,
      $inc: { adminUnreadCount: 1 }
    })

    // Real-time broadcast to room
    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:message', message)
      // Notify admin monitoring room
      global.io.to('admin-room').emit('direct-enquiry:activity', {
        enquiryId: enquiry._id,
        senderType: 'buyer',
        preview: (text || 'Attachment').substring(0, 50)
      })
    }

    res.status(201).json({
      success: true,
      message
    })
  } catch (error) {
    console.error('sendEnquiryMessage error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to send message' })
  }
}

/**
 * @desc Respond to quotation: Accept or Reject (Buyer only)
 * @route POST /api/enquiries/:id/quotation/respond
 */
exports.respondToQuotation = async (req, res) => {
  try {
    const { action, rejectionReason } = req.body // action: 'ACCEPT' | 'REJECT'

    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    if (enquiry.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    if (!enquiry.quotation || !enquiry.quotation.grandTotal) {
      return res.status(400).json({ success: false, message: 'No quotation has been issued for this enquiry' })
    }

    if (action === 'ACCEPT') {
      enquiry.quotation.status = 'ACCEPTED'
      enquiry.quotation.respondedAt = new Date()
      enquiry.status = 'ACCEPTED'
      enquiry.auditLog.push({
        action: 'QUOTATION_ACCEPTED',
        performedBy: 'buyer',
        performedById: req.user._id.toString(),
        timestamp: new Date()
      })

      // Add system message into the chat
      await EnquiryMessage.create({
        enquiryId: enquiry._id,
        senderType: 'system',
        senderId: req.user._id,
        senderName: 'System',
        messageType: 'status_change',
        text: `✅ Buyer accepted quotation #${enquiry.quotation.quotationNumber || enquiry.enquiryNumber} for ${enquiry.quotation.currency || 'USD'} ${enquiry.quotation.grandTotal.toLocaleString()}`
      })
    } else if (action === 'REJECT') {
      enquiry.quotation.status = 'REJECTED'
      enquiry.quotation.rejectionReason = rejectionReason || 'Buyer requested price revision'
      enquiry.quotation.respondedAt = new Date()
      enquiry.status = 'IN_DISCUSSION'
      enquiry.auditLog.push({
        action: 'QUOTATION_REJECTED',
        performedBy: 'buyer',
        performedById: req.user._id.toString(),
        details: { reason: rejectionReason },
        timestamp: new Date()
      })

      // Add system message into the chat
      await EnquiryMessage.create({
        enquiryId: enquiry._id,
        senderType: 'system',
        senderId: req.user._id,
        senderName: 'System',
        messageType: 'status_change',
        text: `❌ Buyer declined the quotation. Reason: ${rejectionReason || 'Negotiation continuing'}`
      })
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be ACCEPT or REJECT' })
    }

    await enquiry.save()

    // Notify admins via Socket
    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:status-updated', {
        status: enquiry.status,
        quotationStatus: enquiry.quotation.status
      })
      global.io.to('admin-room').emit('direct-enquiry:status-updated', {
        enquiryId: enquiry._id,
        status: enquiry.status
      })
    }

    res.json({
      success: true,
      message: `Quotation ${action === 'ACCEPT' ? 'accepted' : 'declined'} successfully`,
      enquiry
    })
  } catch (error) {
    console.error('respondToQuotation error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to respond to quotation' })
  }
}

/**
 * @desc Convert accepted quotation into an Order (Buyer only)
 * @route POST /api/enquiries/:id/convert-to-order
 */
exports.convertToOrder = async (req, res) => {
  try {
    const { deliveryAddress } = req.body

    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('productId')

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    if (enquiry.buyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    if (enquiry.status !== 'ACCEPTED' || enquiry.quotation?.status !== 'ACCEPTED') {
      return res.status(400).json({ success: false, message: 'Quotation must be accepted before converting to an order' })
    }

    // Check if already converted
    if (enquiry.orderId) {
      const existingOrder = await Order.findById(enquiry.orderId)
      if (existingOrder) {
        return res.json({
          success: true,
          message: 'Enquiry was already converted to an order',
          order: existingOrder
        })
      }
    }

    const q = enquiry.quotation
    const product = enquiry.productId
    const orderNumber = `ORD-ENQ-${Date.now().toString().slice(-6)}`

    // Create Order using existing Order model schema
    const order = await Order.create({
      orderNumber,
      buyerId: req.user._id,
      sellerId: enquiry.sellerId,
      items: [{
        productId: product._id,
        productName: product.title,
        productImage: product.images?.[0] || '',
        productSku: product.sku || '',
        quantity: q.quantity,
        price: q.unitPrice,
        priceUSD: q.unitPrice,
        displayPrice: q.unitPrice,
        subtotal: q.subtotal
      }],
      subtotal: q.subtotal,
      shippingFee: q.shipping || 0,
      tax: q.tax || 0,
      grandTotal: q.grandTotal,
      buyerCurrency: q.currency || 'USD',
      paymentCurrency: q.currency || 'USD',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      deliveryAddress: deliveryAddress || {
        fullName: req.user.name || '',
        phone: req.user.phone || '',
        email: req.user.email || '',
        street: enquiry.deliveryLocation,
        city: '',
        state: '',
        country: '',
        zipCode: ''
      }
    })

    enquiry.orderId = order._id
    enquiry.auditLog.push({
      action: 'CONVERTED_TO_ORDER',
      performedBy: 'buyer',
      performedById: req.user._id.toString(),
      details: { orderId: order._id, orderNumber: order.orderNumber },
      timestamp: new Date()
    })
    await enquiry.save()

    // Add system message
    await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'system',
      senderId: req.user._id,
      senderName: 'System',
      messageType: 'status_change',
      text: `📦 Order #${order.orderNumber} successfully generated from this quotation.`
    })

    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:converted-to-order', {
        orderId: order._id,
        orderNumber: order.orderNumber
      })
      global.io.to('admin-room').emit('newOrder', order)
    }

    res.status(201).json({
      success: true,
      message: 'Enquiry converted to order successfully',
      order
    })
  } catch (error) {
    console.error('convertToOrder error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to convert to order' })
  }
}
