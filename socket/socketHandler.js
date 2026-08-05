const {
  getAIReply,
  deactivateBot,
  isBotActive
} = require('../services/aiChatService')
const Message = require('../models/Message')
const ChatRoom = require('../models/ChatRoom')
const Seller = require('../models/Seller')

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id)

    socket.on('join', (userId) => {
      socket.userId = userId
      socket.join(userId)
      console.log(`User ${userId} joined`)
    })

    socket.on('joinAdmin', () => {
      socket.join('admin-room')
      console.log('Admin joined admin-room')
    })

    socket.on('joinRoom', (roomId) => {
      socket.join(roomId)
      console.log(`Socket joined room ${roomId}`)
    })

    // Main message handler with AI
    socket.on('sendMessage', async (data) => {
      const { roomId, message } = data

      try {
        // Save buyer/seller message to DB
        const savedMessage = await Message.create({
          chatRoomId: roomId,
          ...message
        })

        // Update chat room last message
        await ChatRoom.findByIdAndUpdate(roomId, {
          lastMessage: message.text,
          lastMessageAt: new Date(),
          lastMessageBy: message.senderType
        })

        // Emit message to room
        io.to(roomId).emit('receiveMessage', savedMessage)

        // Notify admin monitoring
        io.to('admin-room').emit('chatActivity', {
          roomId,
          senderType: message.senderType,
          preview: message.text?.substring(0, 50)
        })

        // Only trigger initial AI welcome reply on buyer's FIRST message
        if (message.senderType === 'buyer') {
          const chatRoom = await ChatRoom.findById(roomId)

          // Check how many bot messages exist for this room
          const botMsgCount = await Message.countDocuments({
            chatRoomId: roomId,
            senderType: 'bot'
          })

          if (botMsgCount === 0) {
            const BotConfig = require('../models/BotConfig')
            let botConfig = null
            if (chatRoom?.sellerId) {
              botConfig = await BotConfig.findOne({ sellerId: chatRoom.sellerId })
            }

            const welcomeText = botConfig?.welcomeMessage || "Hello! 👋 Thank you for reaching out to UBS Global. How can we help you with your order, pricing, or product inquiry today?"
            const botName = botConfig?.botName || "UBS Assistant"

            // Show typing indicator briefly
            io.to(roomId).emit('botTyping', { roomId, isTyping: true })
            await new Promise(resolve => setTimeout(resolve, 1000))
            io.to(roomId).emit('botTyping', { roomId, isTyping: false })

            const welcomeMsg = await Message.create({
              chatRoomId: roomId,
              senderType: 'bot',
              senderName: botName,
              messageType: 'text',
              text: welcomeText,
              isBot: true
            })

            io.to(roomId).emit('receiveMessage', welcomeMsg)

            // Deactivate bot for this room after first welcome response
            const { deactivateBot } = require('../services/aiChatService')
            await deactivateBot(roomId, 'first_welcome_sent')
          }
        }

        // If seller sends message, deactivate bot
        if (message.senderType === 'seller') {
          const wasActive = await isBotActive(roomId)
          if (wasActive) {
            await deactivateBot(roomId, 'seller_takeover')
            // Notify room that seller is now chatting
            io.to(roomId).emit('sellerTookOver', {
              roomId,
              message: 'The seller has joined the conversation! 👋'
            })
          }
        }

      } catch (error) {
        console.error('Message handler error:', error)
      }
    })

    // Seller manually takes over
    socket.on('sellerTakeover', async (data) => {
      const { roomId } = data
      await deactivateBot(roomId, 'seller_takeover')
      io.to(roomId).emit('sellerTookOver', {
        roomId,
        message: 'Seller has joined the chat! 👋'
      })
    })

    // Typing indicators
    socket.on('typing', (data) => {
      socket.to(data.roomId).emit('userTyping', data)
    })

    socket.on('stopTyping', (data) => {
      socket.to(data.roomId).emit('userStopTyping', data)
    })

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected:', socket.id)
    })
  })
}