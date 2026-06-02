const mongoose = require('mongoose')
const User = require('../models/User')
const Seller = require('../models/Seller')
const Product = require('../models/Product')
const Order = require('../models/Order')
const Transaction = require('../models/Transaction')
const Category = require('../models/Category')
const Banner = require('../models/Banner')
const Notification = require('../models/Notification')
const ContactRequest = require('../models/ContactRequest')
const ChatRoom = require('../models/ChatRoom')
const Message = require('../models/Message')
const Review = require('../models/Review')
const { sendPushNotification, createInAppNotification } = require('../utils/notifications')
const { sendEmail } = require('../utils/sendEmail')
const SystemConfig = require('../models/SystemConfig')

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit)
})

exports.getDashboardStats = async (req, res) => {
  const now = new Date()
  const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousPeriodEnd = new Date(currentPeriodStart)

  const [
    totalUsers, totalSellers, totalProducts,
    totalOrders, pendingOrders, totalRevenue,
    pendingSellerRequests, pendingProducts,
    previousPeriodUsers, previousPeriodSellers, previousPeriodProducts,
    previousPeriodRevenue, orderStatusBreakdown, dailyRevenueData
  ] = await Promise.all([
    User.countDocuments({ role: 'buyer' }),
    Seller.countDocuments({ status: 'approved' }),
    Product.countDocuments({ approvalStatus: 'approved' }),
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: 'placed' }),
    Transaction.aggregate([{
      $group: { _id: null, total: { $sum: '$adminEarnings' } }
    }]),
    Seller.countDocuments({ status: 'pending' }),
    Product.countDocuments({ approvalStatus: 'pending' }),
    User.countDocuments({ role: 'buyer', createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd } }),
    Seller.countDocuments({ status: 'approved', createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd } }),
    Product.countDocuments({ approvalStatus: 'approved', createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd } }),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: previousPeriodStart, $lt: previousPeriodEnd } } },
      { $group: { _id: null, total: { $sum: '$adminEarnings' } } }
    ]),
    Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6) } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$adminEarnings' }
      } },
      { $sort: { _id: 1 } }
    ])
  ])

  // Calculate trends
  const usersTrend = previousPeriodUsers ? Math.round(((totalUsers - previousPeriodUsers) / previousPeriodUsers) * 100) : 0
  const sellersTrend = previousPeriodSellers ? Math.round(((totalSellers - previousPeriodSellers) / previousPeriodSellers) * 100) : 0
  const productsTrend = previousPeriodProducts ? Math.round(((totalProducts - previousPeriodProducts) / previousPeriodProducts) * 100) : 0
  const revenueTrend = previousPeriodRevenue[0]?.total ? Math.round(((totalRevenue[0]?.total - previousPeriodRevenue[0]?.total) / previousPeriodRevenue[0]?.total) * 100) : 0

  // Format order status
  const orderStatusMap = {}
  orderStatusBreakdown.forEach(item => {
    orderStatusMap[item._id] = item.count
  })

  const recentOrders = await Order.find()
    .populate('buyerId', 'name avatar')
    .populate('sellerId', 'shopName')
    .sort({ createdAt: -1 })
    .limit(10)

  const topSellers = await Seller.find({ status: 'approved' })
    .sort({ totalRevenue: -1 })
    .limit(5)

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalSellers,
      totalProducts,
      totalOrders,
      pendingOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingSellerRequests,
      pendingProducts,
      usersTrend,
      sellersTrend,
      productsTrend,
      revenueTrend,
      orderStatusBreakdown: orderStatusMap
    },
    dailyRevenueData: dailyRevenueData.map(item => ({
      name: new Date(item._id).toLocaleDateString('en-US', { weekday: 'short' }),
      date: item._id,
      revenue: item.revenue
    })),
    recentOrders,
    topSellers
  })
}

exports.getSellers = async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query
  const query = {}
  if (status) query.status = status
  if (search) {
    query.$or = [
      { shopName: new RegExp(search, 'i') },
      { ownerName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') }
    ]
  }
  const total = await Seller.countDocuments(query)
  const sellers = await Seller.find(query)
    .populate('userId', 'name email avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    sellers,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.approveSeller = async (req, res) => {
  const { id } = req.params
  const { note } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid seller id' })
  }
  const seller = await Seller.findById(id)
  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' })
  }
  seller.status = 'approved'
  if (note) seller.adminNote = note
  await seller.save()
  res.json({ success: true, seller })
}

exports.rejectSeller = async (req, res) => {
  const { id } = req.params
  const { reason } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid seller id' })
  }
  const seller = await Seller.findById(id)
  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' })
  }
  seller.status = 'rejected'
  if (reason) seller.adminNote = reason
  await seller.save()
  res.json({ success: true, seller })
}

exports.suspendSeller = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid seller id' })
  }
  const seller = await Seller.findById(id)
  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' })
  }
  seller.status = 'suspended'
  await seller.save()
  res.json({ success: true, seller })
}

exports.getUsers = async (req, res) => {
  const { role, page = 1, limit = 20, search } = req.query
  const query = {}
  if (role) query.role = role
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') }
    ]
  }
  const total = await User.countDocuments(query)
  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    users,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.blockUser = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' })
  }
  const user = await User.findById(id)
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' })
  }
  user.isBlocked = true
  await user.save()
  res.json({ success: true, user })
}

exports.unblockUser = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' })
  }
  const user = await User.findById(id)
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' })
  }
  user.isBlocked = false
  await user.save()
  res.json({ success: true, user })
}

exports.getProducts = async (req, res) => {
  const { approvalStatus, page = 1, limit = 20, search } = req.query
  const query = {}
  if (approvalStatus) query.approvalStatus = approvalStatus
  if (search) {
    query.$or = [
      { title: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') }
    ]
  }
  const total = await Product.countDocuments(query)
  const products = await Product.find(query)
    .populate('sellerId', 'shopName email')
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    products,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.approveProduct = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid product id' })
  }
  const product = await Product.findById(id)
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' })
  }
  product.approvalStatus = 'approved'
  await product.save()
  res.json({ success: true, product })
}

exports.rejectProduct = async (req, res) => {
  const { id } = req.params
  const { reason } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid product id' })
  }
  const product = await Product.findById(id)
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' })
  }
  product.approvalStatus = 'rejected'
  if (reason) product.rejectionReason = reason
  await product.save()
  res.json({ success: true, product })
}

exports.getOrders = async (req, res) => {
  const { status, paymentStatus, page = 1, limit = 20, search } = req.query
  const query = {}
  if (status) query.orderStatus = status
  if (paymentStatus) query.paymentStatus = paymentStatus
  if (search) {
    query.$or = [
      { trackingNumber: new RegExp(search, 'i') },
      { 'deliveryAddress.name': new RegExp(search, 'i') }
    ]
  }
  const total = await Order.countDocuments(query)
  const orders = await Order.find(query)
    .populate('buyerId', 'name email')
    .populate('sellerId', 'shopName')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    orders,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.getRevenueAnalytics = async (req, res) => {
  const period = req.query.period || 'month'
  const start = new Date()
  if (period === 'week') {
    start.setDate(start.getDate() - 7)
  } else if (period === 'year') {
    start.setFullYear(start.getFullYear() - 1)
  } else {
    start.setMonth(start.getMonth() - 1)
  }

  const revenueData = await Transaction.aggregate([
    { $match: { createdAt: { $gte: start }, status: { $ne: 'failed' } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$adminEarnings' },
        totalTransactions: { $sum: 1 },
        totalCommission: { $sum: '$commissionAmount' }
      }
    }
  ])

  const totalRevenue = revenueData[0]?.totalRevenue || 0
  const totalTransactions = revenueData[0]?.totalTransactions || 0
  const totalOrders = await Order.countDocuments({ createdAt: { $gte: start } })

  res.json({
    success: true,
    period,
    totalRevenue,
    totalTransactions,
    totalOrders
  })
}

exports.getContactRequests = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query
  const query = {}
  if (status) query.status = status
  const total = await ContactRequest.countDocuments(query)
  const requests = await ContactRequest.find(query)
    .populate('buyerId', 'name email phone')
    .populate('sellerId', 'shopName')
    .populate('productId', 'title images')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    requests,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.getChatRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find()
      .populate('buyerId', 'name avatar')
      .populate('sellerId', 'shopName ownerName shopLogo')
      .populate('productId', 'title images price')
      .sort({ lastMessageAt: -1, updatedAt: -1 })

    const { isBotActive } = require('../services/aiChatService')
    const roomsWithBotStatus = await Promise.all(rooms.map(async (room) => {
      const active = await isBotActive(room._id)
      return {
        ...room.toObject(),
        botActive: active
      }
    }))

    res.json({ success: true, rooms: roomsWithBotStatus })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getAdminChatMessages = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid room id' })
  }
  const messages = await Message.find({ chatRoomId: id, isDeleted: false }).sort({ createdAt: 1 })
  res.json({ success: true, messages })
}

exports.sendAdminMessage = async (req, res) => {
  const { id } = req.params
  const { text } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid room id' })
  }
  const room = await ChatRoom.findById(id)
  if (!room) {
    return res.status(404).json({ success: false, message: 'Chat room not found' })
  }
  const message = await Message.create({
    chatRoomId: id,
    senderId: req.admin._id,
    senderType: 'admin',
    senderName: req.admin.name,
    messageType: 'text',
    text,
    isRead: false
  })
  await ChatRoom.findByIdAndUpdate(id, {
    lastMessage: text,
    lastMessageAt: new Date(),
    lastMessageBy: 'admin',
    buyerUnread: (room.buyerUnread || 0) + 1,
    sellerUnread: (room.sellerUnread || 0) + 1,
  })
  if (global.io) {
    global.io.to(id).emit('receiveMessage', message)
    global.io.to('admin-room').emit('chatActivity', {
      roomId: id,
      senderType: 'admin',
      preview: text?.substring(0, 80)
    })
  }
  res.json({ success: true, message })
}

exports.approveContactRequest = async (req, res) => {
  const { id } = req.params
  const { adminNote } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid contact request id' })
  }
  const request = await ContactRequest.findById(id)
  if (!request) {
    return res.status(404).json({ success: false, message: 'Contact request not found' })
  }

  const buyer = await User.findById(request.buyerId)
  const seller = await Seller.findById(request.sellerId)

  const chatRoom = await ChatRoom.create({
    contactRequestId: request._id,
    buyerId: request.buyerId,
    sellerId: request.sellerId,
    adminId: req.admin._id,
    productId: request.productId,
    roomName: `${request.buyerName} × ${request.sellerShop}`,
    adminMonitoring: true,
    status: 'active',
    lastMessage: request.subject || 'Contact request connected',
    lastMessageAt: new Date(),
    lastMessageBy: 'admin',
  })

  request.status = 'connected'
  request.chatRoomId = chatRoom._id
  request.adminId = req.admin._id
  if (adminNote) request.adminNote = adminNote
  request.reviewedAt = new Date()
  request.connectedAt = new Date()
  await request.save()

  if (global.io) {
    global.io.to(request.buyerId.toString()).emit('requestApproved', {
      chatRoomId: chatRoom._id,
      sellerName: request.sellerShop,
      message: 'Your request was approved! You can now chat with the seller.'
    })

    global.io.to(request.sellerId.toString()).emit('newBuyerConnected', {
      chatRoomId: chatRoom._id,
      buyerName: request.buyerName,
      productName: request.productName,
      message: 'A buyer wants to connect with you!'
    })

    global.io.to('admin-room').emit('chatActivity', {
      roomId: chatRoom._id,
      preview: `Connection started: ${request.buyerName}`
    })
  }

  await createInAppNotification({
    userId: request.buyerId,
    userType: 'User',
    title: 'Request Approved!',
    message: `Your contact request with ${request.sellerShop} is now connected.`, 
    type: 'contact_request',
    data: { requestId: request._id, roomId: chatRoom._id }
  })

  await createInAppNotification({
    userId: request.sellerId,
    userType: 'Seller',
    title: 'New Buyer Connected!',
    message: `${request.buyerName} is ready to chat about ${request.productName}.`, 
    type: 'message',
    data: { requestId: request._id, roomId: chatRoom._id }
  })

  await sendPushNotification(buyer, {
    title: '✅ Request Approved!',
    body: `You can now chat with ${request.sellerShop}`
  })

  await sendPushNotification(seller, {
    title: '🛍️ New Buyer Connected!',
    body: `${request.buyerName} wants to discuss ${request.productName}`
  })

  await sendEmail({
    to: buyer.email,
    subject: 'Your UBS Global request has been approved',
    html: `<p>Hello ${buyer.name},</p><p>Your request with ${request.sellerShop} has been approved. You can now start chatting.</p>`
  })

  res.json({ success: true, message: 'Buyer and seller connected successfully', chatRoom })
}

exports.rejectContactRequest = async (req, res) => {
  const { id } = req.params
  const { reason } = req.body
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid contact request id' })
  }
  const request = await ContactRequest.findById(id)
  if (!request) {
    return res.status(404).json({ success: false, message: 'Contact request not found' })
  }

  request.status = 'rejected'
  if (reason) request.adminNote = reason
  request.reviewedAt = new Date()
  await request.save()

  if (global.io) {
    global.io.to(request.buyerId.toString()).emit('requestRejected', {
      reason,
      message: 'Your contact request was not approved.'
    })
  }

  const buyer = await User.findById(request.buyerId)

  await createInAppNotification({
    userId: request.buyerId,
    userType: 'User',
    title: 'Request Rejected',
    message: `${reason || 'Your contact request was not approved.'}`,
    type: 'contact_request',
    data: { requestId: request._id }
  })

  await sendPushNotification(buyer, {
    title: 'Request not approved',
    body: `Your contact request to ${request.sellerShop} was rejected.`
  })

  await sendEmail({
    to: buyer.email,
    subject: 'UBS Global contact request update',
    html: `<p>Hello ${buyer.name},</p><p>Your contact request to ${request.sellerShop} was not approved.</p><p>Reason: ${reason || 'No reason provided.'}</p>`
  })

  res.json({ success: true, message: 'Request rejected', request })
}

exports.sendNotification = async (req, res) => {
  const { title, message, type = 'system', userId, userType, data } = req.body
  const notification = await Notification.create({
    title,
    message,
    type,
    userId: userId || null,
    userType: userType || 'Admin',
    data: data || null
  })

  if (global.io) {
    global.io.emit('adminNotification', notification)
  }

  res.status(201).json({ success: true, notification })
}

exports.getCategories = async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 })
  res.json({ success: true, categories })
}

exports.createCategory = async (req, res) => {
  const { name, slug, description, parent, isActive, sortOrder } = req.body
  let image = req.body.image

  if (req.file) {
    if (req.file.path && req.file.path.startsWith('http')) {
      image = req.file.path
    } else {
      image = `${req.protocol}://${req.get('host')}/uploads/categories/${req.file.filename}`
    }
  }

  const category = await Category.create({
    name,
    slug,
    image,
    description,
    parent: parent || null,
    isActive: isActive === 'false' ? false : (isActive !== false),
    sortOrder: Number(sortOrder) || 0
  })
  res.status(201).json({ success: true, category })
}

exports.updateCategory = async (req, res) => {
  const { id } = req.params
  const updates = { ...req.body }

  if (req.file) {
    if (req.file.path && req.file.path.startsWith('http')) {
      updates.image = req.file.path
    } else {
      updates.image = `${req.protocol}://${req.get('host')}/uploads/categories/${req.file.filename}`
    }
  }

  if (updates.isActive !== undefined) {
    updates.isActive = updates.isActive === 'true' || updates.isActive === true
  }
  if (updates.sortOrder !== undefined) {
    updates.sortOrder = Number(updates.sortOrder) || 0
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid category id' })
  }
  const category = await Category.findByIdAndUpdate(id, updates, { new: true })
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' })
  }
  res.json({ success: true, category })
}

exports.deleteCategory = async (req, res) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid category id' })
  }
  const category = await Category.findByIdAndDelete(id)
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' })
  }
  res.json({ success: true, message: 'Category deleted' })
}

exports.getBanners = async (req, res) => {
  const banners = await Banner.find().sort({ sortOrder: 1, createdAt: -1 })
  res.json({ success: true, banners })
}

exports.createBanner = async (req, res) => {
  const { title, image, linkUrl, position, isActive, startDate, endDate, sortOrder } = req.body
  const banner = await Banner.create({
    title,
    image,
    linkUrl,
    position: position || 'top',
    isActive: isActive !== false,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    sortOrder: Number(sortOrder) || 0
  })
  res.status(201).json({ success: true, banner })
}

exports.getTransactions = async (req, res) => {
  const { status, page = 1, limit = 20, search } = req.query
  const query = {}
  if (status) query.status = status
  if (search) {
    query.$or = [
      { paymentMethod: new RegExp(search, 'i') },
      { stripePaymentId: new RegExp(search, 'i') }
    ]
  }
  const total = await Transaction.countDocuments(query)
  const transactions = await Transaction.find(query)
    .populate('orderId', 'orderStatus grandTotal')
    .populate('sellerId', 'shopName')
    .populate('buyerId', 'name email')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  res.json({
    success: true,
    transactions,
    pagination: buildPagination(Number(page), Number(limit), total)
  })
}

exports.getSettings = async (req, res) => {
  try {
    let config = await SystemConfig.findOne()
    if (!config) {
      // Create default settings if none exist
      config = await SystemConfig.create({
        requireJobApproval: true,
        requireServiceApproval: true
      })
    }
    res.json({ success: true, settings: config })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.updateSettings = async (req, res) => {
  try {
    const { requireJobApproval, requireServiceApproval } = req.body
    let config = await SystemConfig.findOne()
    if (!config) {
      config = new SystemConfig()
    }
    if (requireJobApproval !== undefined) config.requireJobApproval = requireJobApproval
    if (requireServiceApproval !== undefined) config.requireServiceApproval = requireServiceApproval
    
    await config.save()
    res.json({ success: true, message: 'Settings updated successfully', settings: config })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' })
    }
    const product = await Product.findById(id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }
    
    const { title, description, price, approvalStatus } = req.body
    if (title !== undefined) product.title = title.trim()
    if (description !== undefined) product.description = description.trim()
    if (price !== undefined) product.price = Number(price)
    product.approvalStatus = approvalStatus !== undefined ? approvalStatus : 'approved'

    await product.save()

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('sellerId', 'shopName email')

    res.json({ success: true, message: 'Listing updated successfully', product: populatedProduct })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isApproved, isFlagged } = req.query
    const query = {}
    
    if (isApproved !== undefined) query.isApproved = isApproved === 'true'
    if (isFlagged !== undefined) query.isFlagged = isFlagged === 'true'
    
    if (search) {
      query.$or = [
        { comment: new RegExp(search, 'i') },
        { title: new RegExp(search, 'i') }
      ]
    }
    
    const total = await Review.countDocuments(query)
    const reviews = await Review.find(query)
      .populate('buyerId', 'name email avatar')
      .populate('productId', 'title images price')
      .populate('sellerId', 'shopName')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      
    res.json({
      success: true,
      reviews,
      pagination: buildPagination(Number(page), Number(limit), total)
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid review id' })
    }
    const review = await Review.findById(id)
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    review.isApproved = true
    review.isFlagged = false
    await review.save()
    
    const { recalculateRatings } = require('./reviewController')
    await recalculateRatings(review.productId, review.sellerId)
    
    res.json({ success: true, message: 'Review approved successfully', review })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid review id' })
    }
    const review = await Review.findById(id)
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    const productId = review.productId
    const sellerId = review.sellerId
    
    await Review.findByIdAndDelete(id)
    
    const { recalculateRatings } = require('./reviewController')
    await recalculateRatings(productId, sellerId)
    
    res.json({ success: true, message: 'Review deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}


