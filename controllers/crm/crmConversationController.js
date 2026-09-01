const ChatRoom = require('../../models/ChatRoom')
const Message = require('../../models/Message')
const User = require('../../models/User')
const Seller = require('../../models/Seller')

exports.getConversations = async (req, res) => {
  try {
    const { search, filter } = req.query
    const query = {}

    const rooms = await ChatRoom.find(query)
      .populate('participants', 'name email avatar role')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()

    // Enrich with last message
    const enrichedRooms = await Promise.all(
      rooms.map(async (room) => {
        const lastMsg = await Message.findOne({ chatRoomId: room._id })
          .sort({ createdAt: -1 })
          .lean()
        return {
          ...room,
          lastMessage: lastMsg
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
    const messages = await Message.find({ chatRoomId: id })
      .populate('senderId', 'name avatar role')
      .sort({ createdAt: 1 })

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

    const message = await Message.create({
      chatRoomId: id,
      senderId: req.crmStaff?._id,
      senderModel: 'CRMStaff',
      senderName: req.crmStaff?.name,
      text,
      attachments: attachments || [],
      read: true
    })

    // Emit socket event if io exists
    if (global.io) {
      global.io.to(id).emit('new_message', message)
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
