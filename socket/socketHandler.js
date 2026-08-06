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

        // Trigger AI Assistant reply if message is from buyer
        if (message.senderType === 'buyer') {
          const chatRoom = await ChatRoom.findById(roomId)
          const { isBotActive, getAIReply } = require('../services/aiChatService')
          const botActive = await isBotActive(roomId)

          if (botActive) {
            // Show typing indicator
            io.to(roomId).emit('botTyping', { roomId, isTyping: true })

            const roomContext = {
              buyerId: message.senderId,
              sellerId: chatRoom?.sellerId,
              productId: chatRoom?.productId || chatRoom?.meta?.productId,
              propertyId: chatRoom?.meta?.propertyId
            }

            await new Promise(resolve => setTimeout(resolve, 800))

            const aiResponse = await getAIReply(roomId, message.text, roomContext)

            io.to(roomId).emit('botTyping', { roomId, isTyping: false })

            if (aiResponse && aiResponse.reply) {
              const BotConfig = require('../models/BotConfig')
              let botConfig = null
              if (chatRoom?.sellerId) {
                botConfig = await BotConfig.findOne({ sellerId: chatRoom.sellerId })
              }

              const botMessage = await Message.create({
                chatRoomId: roomId,
                senderType: 'bot',
                senderName: botConfig?.botName || 'UBS Assistant',
                messageType: 'text',
                text: aiResponse.reply,
                isBot: true
              })

              await ChatRoom.findByIdAndUpdate(roomId, {
                lastMessage: aiResponse.reply,
                lastMessageAt: new Date(),
                lastMessageBy: 'bot'
              })

              io.to(roomId).emit('receiveMessage', botMessage)
            }
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