module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id)

    socket.on('join', (userId) => {
      socket.join(userId)
      console.log(`User ${userId} joined`)
    })

    socket.on('joinAdmin', () => {
      socket.join('admin-room')
    })

    socket.on('joinRoom', (roomId) => {
      socket.join(roomId)
    })

    socket.on('sendMessage', async (data) => {
      const { roomId, message } = data
      const Message = require('../models/Message')
      const ChatRoom = require('../models/ChatRoom')

      const saved = await Message.create({
        chatRoomId: roomId,
        ...message
      })

      await ChatRoom.findByIdAndUpdate(roomId, {
        lastMessage: message.text,
        lastMessageAt: new Date()
      })

      io.to(roomId).emit('receiveMessage', saved)
      io.to('admin-room').emit('chatActivity', {
        roomId,
        preview: message.text?.substring(0, 50)
      })
    })

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