const mongoose = require('mongoose')
const ChatRoom = require('../models/ChatRoom')
const Message = require('../models/Message')
const User = require('../models/User')
const Seller = require('../models/Seller')
const { createInAppNotification, sendPushNotification } = require('../utils/notifications')

const ensureParticipant = async (room, userId) => {
  const id = userId.toString()
  if (room.buyerId?.toString() === id || room.adminId?.toString() === id) {
    return true
  }
  if (room.sellerId?.toString() === id) {
    return true
  }
  const seller = await Seller.findOne({ userId })
  if (seller && room.sellerId?.toString() === seller._id.toString()) {
    return true
  }
  return false
}

exports.getMyRooms = async (req, res) => {
  try {
    const userId = req.user._id
    const seller = await Seller.findOne({ userId })
    
    const orConditions = [
      { buyerId: userId, isDeletedByBuyer: { $ne: true } },
      { sellerId: userId, isDeletedBySeller: { $ne: true } }
    ]
    if (seller) {
      orConditions.push({ sellerId: seller._id, isDeletedBySeller: { $ne: true } })
    }

    const rooms = await ChatRoom.find({ $or: orConditions })
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
    if (!(await ensureParticipant(room, req.user._id))) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    let messages = await Message.find({ chatRoomId: roomId, isDeleted: false })
      .sort({ createdAt: 1 })

    const { isBotActive } = require('../services/aiChatService')
    const botActive = await isBotActive(roomId)

    // If chat room has NO messages yet, send initial welcome message from UBS Assistant!
    if (messages.length === 0) {
      const BotConfig = require('../models/BotConfig')
      let botConfig = null
      if (room.sellerId) {
        botConfig = await BotConfig.findOne({ sellerId: room.sellerId })
      }
      const welcomeText = botConfig?.welcomeMessage || "Hello! 👋 I'm UBS Assistant. How can I help you with product info, pricing, or shipping today?"
      const botName = botConfig?.botName || "UBS Assistant"

      const welcomeMsg = await Message.create({
        chatRoomId: roomId,
        senderType: 'bot',
        senderName: botName,
        messageType: 'text',
        text: welcomeText,
        isBot: true
      })
      messages = [welcomeMsg]
    }

    res.json({ success: true, room, messages, botActive })
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
    if (!(await ensureParticipant(room, req.user._id))) {
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

    if (senderType === 'seller') {
      const { deactivateBot, isBotActive } = require('../services/aiChatService')
      const wasActive = await isBotActive(roomId)
      if (wasActive) {
        await deactivateBot(roomId, 'seller_takeover')
        if (global.io) {
          global.io.to(roomId).emit('sellerTookOver', {
            roomId,
            message: 'The seller has joined the conversation! 👋'
          })
        }
      }
    } else if (senderType === 'buyer') {
      // Trigger AI assistant for buyer messages sent via REST API
      const { isBotActive, getAIReply } = require('../services/aiChatService')
      isBotActive(roomId).then(async (botActive) => {
        if (botActive && text) {
          try {
            const roomContext = {
              buyerId: req.user._id,
              sellerId: room.sellerId,
              productId: room.productId || room.meta?.productId,
              propertyId: room.meta?.propertyId
            }
            const aiResponse = await getAIReply(roomId, text, roomContext)
            if (aiResponse?.reply) {
              const botMessage = await Message.create({
                chatRoomId: roomId,
                senderType: 'bot',
                senderName: 'UBS Assistant',
                messageType: 'text',
                text: aiResponse.reply,
                isBot: true
              })
              await ChatRoom.findByIdAndUpdate(roomId, {
                lastMessage: aiResponse.reply,
                lastMessageAt: new Date(),
                lastMessageBy: 'bot'
              })
              if (global.io) {
                global.io.to(roomId).emit('receiveMessage', botMessage)
              }
            }
          } catch (aiErr) {
            console.error('REST AI Assistant error:', aiErr)
          }
        }
      }).catch(() => {})
    }

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
      ? (room.sellerModel === 'User' ? await User.findById(room.sellerId) : await Seller.findById(room.sellerId))
      : await User.findById(room.buyerId)

    await createInAppNotification({
      userId: targetUserId,
      userType: senderType === 'buyer' ? (room.sellerModel === 'User' ? 'User' : 'Seller') : 'User',
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
    if (!(await ensureParticipant(room, req.user._id))) {
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

exports.deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ success: false, message: 'Invalid room id' })
    }
    const room = await ChatRoom.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat room not found' })
    }

    const userId = req.user._id
    const seller = await Seller.findOne({ userId })

    let isBuyer = room.buyerId?.toString() === userId.toString()
    let isSeller = room.sellerId?.toString() === userId.toString() || (seller && room.sellerId?.toString() === seller._id.toString())

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    if (isBuyer) {
      room.isDeletedByBuyer = true
    }
    if (isSeller) {
      room.isDeletedBySeller = true
    }

    await room.save()
    res.json({ success: true, message: 'Chat room deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
