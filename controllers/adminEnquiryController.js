const DirectEnquiry = require('../models/DirectEnquiry')
const EnquiryMessage = require('../models/EnquiryMessage')
const User = require('../models/User')
const { createInAppNotification, sendPushNotification } = require('../utils/notifications')

/**
 * @desc Get all direct enquiries for admin with filtering & search
 * @route GET /api/admin/enquiries
 */
exports.getEnquiries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    const { status, search, assignedAdminId } = req.query

    const query = {}

    if (status && status !== 'ALL') {
      query.status = status
    }

    if (assignedAdminId) {
      query.assignedAdminId = assignedAdminId
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i')
      // Search by enquiry number or delivery location
      const orConditions = [
        { enquiryNumber: searchRegex },
        { deliveryLocation: searchRegex }
      ]

      // Find matching buyers or products
      const [matchingUsers, matchingProducts] = await Promise.all([
        User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id'),
        require('../models/Product').find({ title: searchRegex }).select('_id')
      ])

      if (matchingUsers.length > 0) {
        orConditions.push({ buyerId: { $in: matchingUsers.map(u => u._id) } })
      }
      if (matchingProducts.length > 0) {
        orConditions.push({ productId: { $in: matchingProducts.map(p => p._id) } })
      }

      query.$or = orConditions
    }

    const [enquiries, total] = await Promise.all([
      DirectEnquiry.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('buyerId', 'name email phone avatar country')
        .populate('productId', 'title images price category sku unit')
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
    console.error('admin getEnquiries error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch enquiries' })
  }
}

/**
 * @desc Get aggregated stats for direct enquiries
 * @route GET /api/admin/enquiries/stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      total,
      pending,
      adminReviewing,
      inDiscussion,
      quotationSent,
      accepted,
      closed,
      unreadCount
    ] = await Promise.all([
      DirectEnquiry.countDocuments(),
      DirectEnquiry.countDocuments({ status: 'PENDING' }),
      DirectEnquiry.countDocuments({ status: 'ADMIN_REVIEWING' }),
      DirectEnquiry.countDocuments({ status: 'IN_DISCUSSION' }),
      DirectEnquiry.countDocuments({ status: 'QUOTATION_SENT' }),
      DirectEnquiry.countDocuments({ status: 'ACCEPTED' }),
      DirectEnquiry.countDocuments({ status: 'CLOSED' }),
      DirectEnquiry.aggregate([
        { $group: { _id: null, totalUnread: { $sum: '$adminUnreadCount' } } }
      ])
    ])

    res.json({
      success: true,
      stats: {
        total,
        pending,
        adminReviewing,
        inDiscussion,
        quotationSent,
        accepted,
        closed,
        unread: unreadCount[0]?.totalUnread || 0
      }
    })
  } catch (error) {
    console.error('getDashboardStats error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * @desc Get single enquiry detail for admin
 * @route GET /api/admin/enquiries/:id
 */
exports.getEnquiryById = async (req, res) => {
  try {
    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('buyerId', 'name email phone avatar country createdAt')
      .populate('productId', 'title images price description category sku unit stock')
      .populate('sellerId', 'shopName shopLogo email phone businessType address')
      .populate('orderId', 'orderNumber grandTotal orderStatus paymentStatus createdAt')

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    // Reset admin unread count when viewed
    if (enquiry.adminUnreadCount > 0) {
      enquiry.adminUnreadCount = 0
      await enquiry.save()
    }

    res.json({
      success: true,
      enquiry
    })
  } catch (error) {
    console.error('admin getEnquiryById error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch enquiry' })
  }
}

/**
 * @desc Get enquiry messages for admin
 * @route GET /api/admin/enquiries/:id/messages
 */
exports.getEnquiryMessages = async (req, res) => {
  try {
    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    const messages = await EnquiryMessage.find({ enquiryId: enquiry._id })
      .sort({ createdAt: 1 })
      .lean()

    // Mark unread buyer messages as read by admin
    await EnquiryMessage.updateMany(
      { enquiryId: enquiry._id, senderType: 'buyer', isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    )

    if (enquiry.adminUnreadCount > 0) {
      await DirectEnquiry.findByIdAndUpdate(enquiry._id, { adminUnreadCount: 0 })
    }

    res.json({
      success: true,
      messages
    })
  } catch (error) {
    console.error('admin getEnquiryMessages error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch messages' })
  }
}

/**
 * @desc Send an admin reply in direct enquiry
 * @route POST /api/admin/enquiries/:id/messages
 */
exports.sendEnquiryMessage = async (req, res) => {
  try {
    const { text, attachments } = req.body

    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('buyerId', 'name email fcmToken')
      .populate('productId', 'title')

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    if (enquiry.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: 'Enquiry is closed' })
    }

    if ((!text || !text.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ success: false, message: 'Message text or attachment is required' })
    }

    const adminName = req.admin?.name || req.admin?.email || 'UBS Global Admin'

    const message = await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'admin',
      senderId: req.admin._id,
      senderName: adminName,
      senderAvatar: '',
      messageType: attachments && attachments.length > 0 ? 'image' : 'text',
      text: (text || '').trim(),
      attachments: Array.isArray(attachments) ? attachments : []
    })

    // Advance to IN_DISCUSSION if currently PENDING or ADMIN_REVIEWING
    let newStatus = enquiry.status
    if (newStatus === 'PENDING' || newStatus === 'ADMIN_REVIEWING') {
      newStatus = 'IN_DISCUSSION'
    }

    await DirectEnquiry.findByIdAndUpdate(enquiry._id, {
      lastMessage: (text || 'Attachment sent').trim(),
      lastMessageAt: new Date(),
      lastMessageBy: 'admin',
      status: newStatus,
      $inc: { buyerUnreadCount: 1 }
    })

    // Real-time broadcast to Room
    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:message', message)
      if (newStatus !== enquiry.status) {
        global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:status-updated', {
          status: newStatus
        })
      }
    }

    // In-app Notification for Buyer
    await createInAppNotification({
      userId: enquiry.buyerId._id,
      userType: 'User',
      title: 'Admin replied to your Direct Enquiry',
      message: `${adminName} replied regarding ${enquiry.productId?.title || 'your enquiry'}: "${(text || 'Sent an attachment').substring(0, 60)}"`,
      type: 'direct_enquiry',
      data: { enquiryId: enquiry._id }
    })

    // Push notification to Buyer device via Firebase Cloud Messaging
    if (enquiry.buyerId?.fcmToken) {
      await sendPushNotification(enquiry.buyerId, {
        title: 'UBS Global — Enquiry Update',
        body: `Admin replied: "${(text || 'New message').substring(0, 80)}"`,
        data: {
          enquiryId: enquiry._id.toString(),
          type: 'direct_enquiry'
        }
      })
    }

    res.status(201).json({
      success: true,
      message
    })
  } catch (error) {
    console.error('admin sendEnquiryMessage error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to send message' })
  }
}

/**
 * @desc Update enquiry status (Admin only)
 * @route PATCH /api/admin/enquiries/:id/status
 */
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body

    const validStatuses = [
      'PENDING',
      'ADMIN_REVIEWING',
      'IN_DISCUSSION',
      'QUOTATION_SENT',
      'ACCEPTED',
      'REJECTED',
      'CLOSED'
    ]

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
    }

    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('buyerId', 'name email fcmToken')
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    const oldStatus = enquiry.status
    enquiry.status = status
    enquiry.auditLog.push({
      action: 'STATUS_CHANGED',
      performedBy: 'admin',
      performedById: req.admin._id.toString(),
      details: { from: oldStatus, to: status },
      timestamp: new Date()
    })

    await enquiry.save()

    // Add system message into enquiry chat
    await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'system',
      senderId: req.admin._id,
      senderName: 'System',
      messageType: 'status_change',
      text: `Status updated to: ${status.replace('_', ' ')}`
    })

    // Real-time broadcast
    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:status-updated', {
        status
      })
      global.io.to('admin-room').emit('direct-enquiry:status-updated', {
        enquiryId: enquiry._id,
        status
      })
    }

    // In-app notification for Buyer
    await createInAppNotification({
      userId: enquiry.buyerId._id,
      userType: 'User',
      title: 'Enquiry Status Updated',
      message: `Your Direct Enquiry #${enquiry.enquiryNumber} status changed to ${status.replace('_', ' ')}`,
      type: 'direct_enquiry',
      data: { enquiryId: enquiry._id }
    })

    res.json({
      success: true,
      message: 'Status updated successfully',
      enquiry
    })
  } catch (error) {
    console.error('admin updateStatus error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to update status' })
  }
}

/**
 * @desc Assign enquiry to an admin
 * @route PATCH /api/admin/enquiries/:id/assign
 */
exports.assignAdmin = async (req, res) => {
  try {
    const { assignedAdminId, assignedAdminName } = req.body

    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    enquiry.assignedAdminId = assignedAdminId || req.admin._id
    enquiry.assignedAdminName = assignedAdminName || req.admin?.name || 'Admin'
    enquiry.auditLog.push({
      action: 'ADMIN_ASSIGNED',
      performedBy: 'admin',
      performedById: req.admin._id.toString(),
      details: { assignedTo: enquiry.assignedAdminName, assignedId: enquiry.assignedAdminId },
      timestamp: new Date()
    })

    await enquiry.save()

    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:assigned', {
        assignedAdminName: enquiry.assignedAdminName
      })
      global.io.to('admin-room').emit('direct-enquiry:assigned', {
        enquiryId: enquiry._id,
        assignedAdminName: enquiry.assignedAdminName
      })
    }

    res.json({
      success: true,
      message: 'Admin assigned successfully',
      enquiry
    })
  } catch (error) {
    console.error('admin assignAdmin error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to assign admin' })
  }
}

/**
 * @desc Authoritative Server-side Quotation Generation (Admin only)
 * @route POST /api/admin/enquiries/:id/quotation
 */
exports.sendQuotation = async (req, res) => {
  try {
    const {
      unitPrice,
      quantity,
      unit,
      discount = 0,
      shipping = 0,
      tax = 0,
      otherCharges = 0,
      currency = 'USD',
      expectedDelivery,
      validUntil,
      notes
    } = req.body

    const enquiry = await DirectEnquiry.findById(req.params.id)
      .populate('buyerId', 'name email fcmToken')
      .populate('productId', 'title')

    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    const price = Number(unitPrice)
    const qty = Number(quantity) || enquiry.quantity

    if (!price || price <= 0) {
      return res.status(400).json({ success: false, message: 'Valid unit price is required' })
    }
    if (!qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Valid quantity is required' })
    }

    // Authoritative Server-side Calculations
    const subtotal = Math.round(price * qty * 100) / 100
    const numDiscount = Math.max(0, Number(discount) || 0)
    const numShipping = Math.max(0, Number(shipping) || 0)
    const numTax = Math.max(0, Number(tax) || 0)
    const numOther = Math.max(0, Number(otherCharges) || 0)
    const grandTotal = Math.round(Math.max(0, subtotal - numDiscount + numShipping + numTax + numOther) * 100) / 100

    const quotationNumber = `QT-${Date.now().toString().slice(-6)}`

    const quotationData = {
      quotationNumber,
      unitPrice: price,
      quantity: qty,
      unit: unit || enquiry.unit || 'pieces',
      subtotal,
      discount: numDiscount,
      shipping: numShipping,
      tax: numTax,
      otherCharges: numOther,
      grandTotal,
      currency: currency || 'USD',
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : undefined,
      validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // default 7 days validity
      notes: notes || '',
      status: 'SENT',
      createdAt: new Date()
    }

    enquiry.quotation = quotationData
    enquiry.status = 'QUOTATION_SENT'
    enquiry.lastMessage = `Official Quotation Sent: ${currency} ${grandTotal.toLocaleString()}`
    enquiry.lastMessageAt = new Date()
    enquiry.lastMessageBy = 'admin'
    enquiry.buyerUnreadCount += 1

    enquiry.auditLog.push({
      action: 'QUOTATION_SENT',
      performedBy: 'admin',
      performedById: req.admin._id.toString(),
      details: { quotationNumber, grandTotal, currency },
      timestamp: new Date()
    })

    await enquiry.save()

    // Add Quotation Message into the Chat Room
    const chatMsg = await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'admin',
      senderId: req.admin._id,
      senderName: req.admin?.name || 'UBS Global Admin',
      messageType: 'quotation',
      text: `📋 Official Quotation Issued: ${currency} ${grandTotal.toLocaleString()}`,
      quotationData
    })

    // Broadcast to Room
    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:quotation-created', {
        quotation: quotationData,
        message: chatMsg
      })
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:status-updated', {
        status: 'QUOTATION_SENT'
      })
    }

    // In-app notification for Buyer
    await createInAppNotification({
      userId: enquiry.buyerId._id,
      userType: 'User',
      title: 'Quotation Received!',
      message: `You received an official quotation of ${currency} ${grandTotal.toLocaleString()} for ${enquiry.productId?.title || 'your enquiry'}. Tap to view and accept.`,
      type: 'direct_enquiry',
      data: { enquiryId: enquiry._id }
    })

    // Push notification to Buyer
    if (enquiry.buyerId?.fcmToken) {
      await sendPushNotification(enquiry.buyerId, {
        title: 'UBS Global — Official Quotation',
        body: `You received a quote for ${qty}x ${enquiry.productId?.title || 'items'} (${currency} ${grandTotal.toLocaleString()})`,
        data: {
          enquiryId: enquiry._id.toString(),
          type: 'direct_enquiry'
        }
      })
    }

    res.json({
      success: true,
      message: 'Quotation sent successfully',
      quotation: quotationData
    })
  } catch (error) {
    console.error('admin sendQuotation error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to generate quotation' })
  }
}

/**
 * @desc Close direct enquiry (Admin only)
 * @route POST /api/admin/enquiries/:id/close
 */
exports.closeEnquiry = async (req, res) => {
  try {
    const enquiry = await DirectEnquiry.findById(req.params.id)
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' })
    }

    enquiry.status = 'CLOSED'
    enquiry.auditLog.push({
      action: 'ENQUIRY_CLOSED',
      performedBy: 'admin',
      performedById: req.admin._id.toString(),
      timestamp: new Date()
    })

    await enquiry.save()

    // Add system message
    await EnquiryMessage.create({
      enquiryId: enquiry._id,
      senderType: 'system',
      senderId: req.admin._id,
      senderName: 'System',
      messageType: 'status_change',
      text: '🔒 Direct enquiry has been closed by administration.'
    })

    if (global.io) {
      global.io.to(`direct-enquiry:${enquiry._id}`).emit('direct-enquiry:closed', {
        enquiryId: enquiry._id
      })
    }

    res.json({
      success: true,
      message: 'Enquiry closed successfully',
      enquiry
    })
  } catch (error) {
    console.error('admin closeEnquiry error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to close enquiry' })
  }
}
