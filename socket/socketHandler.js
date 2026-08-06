const jwt = require('jsonwebtoken')
const {
  getAIReply,
  deactivateBot,
  isBotActive
} = require('../services/aiChatService')
const Message = require('../models/Message')
const ChatRoom = require('../models/ChatRoom')
const Seller = require('../models/Seller')

module.exports = (io) => {
  // JWT Authentication Middleware for Socket.io Connections
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1] ||
      socket.handshake.query?.token

    if (!token) {
      // Unauthenticated socket connection (allowed for public broadcasts, but restricted from joining private rooms)
      socket.user = null
      return next()
    }

    try {
      let decoded
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET)
      } catch (userErr) {
        decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET)
      }
      socket.user = decoded
      socket.userId = (decoded.id || decoded._id || '').toString()
      next()
    } catch (error) {
      console.warn('⚠️ Socket connection rejected: Invalid JWT token')
      return next(new Error('Authentication error: Invalid or expired token'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.userId || 'Guest'})`)

    // Join personal notification channel (requires user authorization)
    socket.on('join', (targetUserId) => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required to join user room' })
      }
      const authUserId = (socket.user.id || socket.user._id || '').toString()
      if (authUserId !== targetUserId && socket.user.role !== 'admin') {
        console.warn(`⚠️ Security block: User ${authUserId} attempted to join room ${targetUserId}`)
        return socket.emit('error', { message: 'Unauthorized room join attempt' })
      }
      socket.userId = targetUserId
      socket.join(targetUserId)
      console.log(`User ${targetUserId} authorized and joined personal room`)
    })

    // Join admin broadcast room (requires admin token)
    socket.on('joinAdmin', () => {
      if (!socket.user || socket.user.role !== 'admin') {
        console.warn(`⚠️ Security block: Non-admin socket ${socket.id} attempted to join admin-room`)
        return socket.emit('error', { message: 'Admin privileges required' })
      }
      socket.join('admin-room')
      console.log('Admin authorized and joined admin-room')
    })

    // Join private chat room (requires buyer, seller, or admin room membership)
    socket.on('joinRoom', async (roomId) => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required to join chat room' })
      }
      try {
        const chatRoom = await ChatRoom.findById(roomId)
        if (!chatRoom) {
          return socket.emit('error', { message: 'Chat room not found' })
        }
        const authUserId = (socket.user.id || socket.user._id || '').toString()
        const isBuyer = chatRoom.buyerId && chatRoom.buyerId.toString() === authUserId
        let isSeller = false
        if (chatRoom.sellerId) {
          const sellerDoc = await Seller.findById(chatRoom.sellerId)
          if (sellerDoc && sellerDoc.userId && sellerDoc.userId.toString() === authUserId) {
            isSeller = true
          }
        }
        const isAdmin = socket.user.role === 'admin'

        if (!isBuyer && !isSeller && !isAdmin) {
          console.warn(`⚠️ Security block: User ${authUserId} attempted to join unauthorized room ${roomId}`)
          return socket.emit('error', { message: 'Not authorized to join this chat room' })
        }

        socket.join(roomId)
        console.log(`User ${authUserId} authorized and joined chat room ${roomId}`)
      } catch (err) {
        socket.emit('error', { message: 'Error joining chat room' })
      }
    })

    // Main message handler with AI
    socket.on('sendMessage', async (data) => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required to send messages' })
      }

      const { roomId, message } = data

      try {
        const chatRoom = await ChatRoom.findById(roomId)
        if (!chatRoom) {
          return socket.emit('error', { message: 'Chat room not found' })
        }

        const authUserId = (socket.user.id || socket.user._id || '').toString()
        const isBuyer = chatRoom.buyerId && chatRoom.buyerId.toString() === authUserId
        let isSeller = false
        if (chatRoom.sellerId) {
          const sellerDoc = await Seller.findById(chatRoom.sellerId)
          if (sellerDoc && sellerDoc.userId && sellerDoc.userId.toString() === authUserId) {
            isSeller = true
          }
        }
        const isAdmin = socket.user.role === 'admin'

        if (!isBuyer && !isSeller && !isAdmin) {
          return socket.emit('error', { message: 'Not authorized to send messages to this room' })
        }

        // Save message to DB
        const savedMessage = await Message.create({
          chatRoomId: roomId,
          senderId: reqUserOrId(socket.user),
          senderType: isBuyer ? 'buyer' : isSeller ? 'seller' : 'admin',
          senderName: socket.user.name || message?.senderName || 'User',
          messageType: message?.messageType || 'text',
          text: message?.text || ''
        })

        // Update chat room last message
        await ChatRoom.findByIdAndUpdate(roomId, {
          lastMessage: message.text,
          lastMessageAt: new Date(),
          lastMessageBy: isBuyer ? 'buyer' : isSeller ? 'seller' : 'admin'
        })

        // Emit message to authorized room members
        io.to(roomId).emit('receiveMessage', savedMessage)

        // Notify admin monitoring
        io.to('admin-room').emit('chatActivity', {
          roomId,
          senderType: isBuyer ? 'buyer' : isSeller ? 'seller' : 'admin',
          preview: message.text?.substring(0, 50)
        })

        // Trigger AI Assistant reply if message is from buyer
        if (isBuyer) {
          const botActive = await isBotActive(roomId)

          if (botActive) {
            io.to(roomId).emit('botTyping', { roomId, isTyping: true })

            const roomContext = {
              buyerId: authUserId,
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
        if (isSeller) {
          const wasActive = await isBotActive(roomId)
          if (wasActive) {
            await deactivateBot(roomId, 'seller_takeover')
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
      if (!socket.user) return
      const { roomId } = data
      await deactivateBot(roomId, 'seller_takeover')
      io.to(roomId).emit('sellerTookOver', {
        roomId,
        message: 'Seller has joined the chat! 👋'
      })
    })

    // Typing indicators
    socket.on('typing', (data) => {
      if (socket.user) {
        socket.to(data.roomId).emit('userTyping', data)
      }
    })

    socket.on('stopTyping', (data) => {
      if (socket.user) {
        socket.to(data.roomId).emit('userStopTyping', data)
      }
    })

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected:', socket.id)
    })
  })
}

function reqUserOrId(user) {
  return user?.id || user?._id || user?.userId
}