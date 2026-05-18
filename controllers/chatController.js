const mongoose = require('mongoose')
const ChatRoom = require('../models/ChatRoom')
const Message = require('../models/Message')
const User = require('../models/User')
const Seller = require('../models/Seller')
const { createInAppNotification, sendPushNotification } = require('../utils/notifications')

const ensureParticipant = (room, userId) => {
  const id = userId.toString()
  return room.buyerId?.toString() === id || room.sellerId?.toString() === id || room.adminId?.toString() === id
}

exports.getMyRooms = async (req, res) => {
  try {
    const userId = req.user._id
    const rooms = await ChatRoom.find({
      $or: [
        { buyerId: userId },
        { sellerId: userId }
      ]
    })
      .populate('buyerId', 'name avatar')
      .populate('sellerId', 'shopName shopLogo ownerName')
      .populate('productId', 'title images price')
      .sort({ lastMessageAt: -1, updatedAt: -1 })

    res.json({ success: true, rooms })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room id' })
    }

    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat room not found' })
    }
    if (!ensureParticipant(room, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const messages = await Message.find({ chatRoomId: roomId, isDeleted: false })
      .sort({ createdAt: 1 })

    res.json({ success: true, room, messages })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.sendMessage = async (req, res) => {
  try {
    const { roomId } = req.params
    const { text, messageType = 'text', imageUrl, fileUrl, fileName, productCard, offerDetails } = req.body

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room id' })
    }
    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat room not found' })
    }
    if (!ensureParticipant(room, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const senderType = req.user.role === 'seller' ? 'seller' : 'buyer'
    const senderName = req.user.name
    const senderAvatar = req.user.avatar

    const message = await Message.create({
      chatRoomId: roomId,
      senderId: req.user._id,
      senderType,
      senderName,
      senderAvatar,
      messageType,
      text,
      imageUrl,
      fileUrl,
      fileName,
      productCard,
      offerDetails,
      isRead: false
    })

    const unreadUpdate = {}
    if (senderType === 'buyer') {
      unreadUpdate.sellerUnread = (room.sellerUnread || 0) + 1
      unreadUpdate.adminUnread = (room.adminUnread || 0) + 1
    } else if (senderType === 'seller') {
      unreadUpdate.buyerUnread = (room.buyerUnread || 0) + 1
      unreadUpdate.adminUnread = (room.adminUnread || 0) + 1
    } else {
      unreadUpdate.buyerUnread = (room.buyerUnread || 0) + 1
      unreadUpdate.sellerUnread = (room.sellerUnread || 0) + 1
    }

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: text || (productCard?.productName ? `Product: ${productCard.productName}` : 'New message'),
      lastMessageAt: new Date(),
      lastMessageBy: senderType,
      ...unreadUpdate
    })

    if (global.io) {
      global.io.to(roomId).emit('receiveMessage', message)
      global.io.to('admin-room').emit('chatActivity', {
        roomId,
        senderType,
        preview: text?.substring(0, 80) || 'New message'
      })
    }

    const targetUserId = senderType === 'buyer' ? room.sellerId : room.buyerId
    const targetUser = senderType === 'buyer'
      ? await Seller.findById(room.sellerId)
      : await User.findById(room.buyerId)

    await createInAppNotification({
      userId: targetUserId,
      userType: senderType === 'buyer' ? 'Seller' : 'User',
      title: 'New chat message',
      message: `${senderName} sent a new message in the UBS Global chat.`,
      type: 'message',
      data: { roomId }
    })

    await sendPushNotification(targetUser, {
      title: 'New message received',
      body: `${senderName} sent a new chat message.`
    })

    res.json({ success: true, message })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.markRoomRead = async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room id' })
    }
    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat room not found' })
    }
    if (!ensureParticipant(room, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const updates = {}
    if (room.buyerId?.toString() === req.user._id.toString()) {
      updates.buyerUnread = 0
    }
    if (room.sellerId?.toString() === req.user._id.toString()) {
      updates.sellerUnread = 0
    }
    await ChatRoom.findByIdAndUpdate(roomId, updates)
    await Message.updateMany({ chatRoomId: roomId, senderId: { $ne: req.user._id }, isRead: false }, { isRead: true, readAt: new Date() })

    res.json({ success: true, message: 'Chat marked as read' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
