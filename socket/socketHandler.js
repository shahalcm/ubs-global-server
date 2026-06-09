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

        // Only trigger AI if message is from buyer
        if (message.senderType === 'buyer') {
          // Get chat room context
          const chatRoom = await ChatRoom.findById(roomId)

          const roomContext = {
            buyerId: message.senderId,
            sellerId: chatRoom?.sellerId,
            productId: chatRoom?.productId || chatRoom?.meta?.productId,
            propertyId: chatRoom?.meta?.propertyId
          }

          // Check if bot is active
          const botActive = await isBotActive(roomId)

          if (botActive) {
            // Show typing indicator
            io.to(roomId).emit('botTyping', {
              roomId,
              isTyping: true
            })

            // Small delay to feel natural
            await new Promise(resolve => setTimeout(resolve, 1500))

            // Get AI reply
            const aiResponse = await getAIReply(
              roomId,
              message.text,
              roomContext
            )

            // Hide typing indicator
            io.to(roomId).emit('botTyping', {
              roomId,
              isTyping: false
            })

            if (aiResponse.success) {
              if (aiResponse.takeover) {
                // Send takeover message
                const takeoverMsg = await Message.create({
                  chatRoomId: roomId,
                  senderType: 'bot',
                  senderName: 'UBS Assistant',
                  messageType: 'text',
                  text: aiResponse.message,
                  isBot: true,
                  isTakeover: true
                })

                io.to(roomId).emit('receiveMessage', takeoverMsg)

                io.to('admin-room').emit('chatActivity', {
                  roomId,
                  senderType: 'bot',
                  preview: aiResponse.message?.substring(0, 50)
                })

                // Notify seller to take over
                if (chatRoom?.sellerId) {
                  let sellerUserId = null
                  if (chatRoom.sellerModel === 'User') {
                    sellerUserId = chatRoom.sellerId.toString()
                  } else {
                    const seller = await Seller.findById(chatRoom.sellerId)
                    if (seller) {
                      sellerUserId = seller.userId?.toString()
                    }
                  }
                  if (sellerUserId) {
                    io.to(sellerUserId).emit('botHandover', {
                      roomId,
                      reason: aiResponse.takeoverReason,
                      message: 'Bot has handed over to you. Please respond.'
                    })
                  }
                }
              } else {
                // Save and send AI reply
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

                io.to(roomId).emit('receiveMessage', botMessage)

                io.to('admin-room').emit('chatActivity', {
                  roomId,
                  senderType: 'bot',
                  preview: aiResponse.reply?.substring(0, 50)
                })
              }
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