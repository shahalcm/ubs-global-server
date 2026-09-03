const ChatRoom = require('../../models/ChatRoom')
const Message = require('../../models/Message')
const User = require('../../models/User')
const Seller = require('../../models/Seller')
const Product = require('../../models/Product')

exports.getConversations = async (req, res) => {
  try {
    const { search, filter } = req.query
    const query = {}

    const rooms = await ChatRoom.find(query)
      .populate('buyerId', 'name email avatar phone')
      .populate('sellerId', 'shopName ownerName shopLogo email phone')
      .populate('productId', 'title images price')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(50)
      .lean()

    // Enrich with last message & structured participant info
    const enrichedRooms = await Promise.all(
      rooms.map(async (room) => {
        const lastMsg = await Message.findOne({ chatRoomId: room._id, isDeleted: false })
          .sort({ createdAt: -1 })
          .lean()

        const isSellerRoom = Boolean(room.sellerId)
        const partner = isSellerRoom && room.sellerId
          ? {
              _id: room.sellerId._id,
              name: room.sellerId.shopName || room.sellerId.ownerName || 'Seller Partner',
              subtitle: room.sellerId.ownerName ? `Owner: ${room.sellerId.ownerName}` : 'Enterprise Seller',
              email: room.sellerId.email || 'seller@ubsglobal.com',
              phone: room.sellerId.phone || '',
              avatar: room.sellerId.shopLogo || '',
              type: 'SELLER'
            }
          : room.buyerId
          ? {
              _id: room.buyerId._id,
              name: room.buyerId.name || 'Buyer Customer',
              subtitle: 'Registered Global Buyer',
              email: room.buyerId.email || '',
              phone: room.buyerId.phone || '',
              avatar: room.buyerId.avatar || '',
              type: 'BUYER'
            }
          : {
              _id: room._id,
              name: room.roomName || 'Client Inquiry',
              subtitle: 'UBS Global Customer',
              email: 'client@ubsglobal.com',
              phone: '',
              avatar: '',
              type: 'CLIENT'
            }

        return {
          ...room,
          partner,
          participants: [partner],
          lastMessage: lastMsg || (room.lastMessage ? { text: room.lastMessage, createdAt: room.lastMessageAt || room.updatedAt } : null)
        }
      })
    )

    res.status(200).json({
      success: true,
      conversations: enrichedRooms
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params
    const messages = await Message.find({ chatRoomId: id, isDeleted: false })
      .sort({ createdAt: 1 })
      .lean()

    res.status(200).json({
      success: true,
      messages
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.sendStaffMessage = async (req, res) => {
  try {
    const { id } = req.params
    const { text, attachments } = req.body

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required'
      })
    }

    const message = await Message.create({
      chatRoomId: id,
      senderId: req.crmStaff?._id || id,
      senderType: 'admin',
      senderName: req.crmStaff?.name || 'CRM Staff Specialist',
      senderAvatar: req.crmStaff?.avatar || '',
      text: text.trim(),
      messageType: 'text',
      isRead: true
    })

    // Update ChatRoom with latest activity
    await ChatRoom.findByIdAndUpdate(id, {
      lastMessage: text.trim(),
      lastMessageAt: new Date(),
      lastMessageBy: req.crmStaff?.name || 'CRM Staff Specialist'
    })

    // Emit socket event if io is configured
    if (global.io) {
      global.io.to(id.toString()).emit('new_message', message)
      global.io.emit('crm_conversation_update', { roomId: id, message })
    }

    res.status(201).json({
      success: true,
      message
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
