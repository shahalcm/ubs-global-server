module.exports = (io) => {
  io.on('connection', (socket) => {
    
    // Register or update userId when user joins
    socket.on('join', (userId) => {
      socket.userId = userId
      socket.join(userId)
    })

    // Initiate voice call to receiver
    socket.on('call-user', (data) => {
      const { receiverId, callerName, callerAvatar, channelId, callId } = data
      const callerId = socket.userId || data.callerId

      if (!callerId) {
        console.warn('⚠️ Call failed: Caller not authenticated on socket')
        return socket.emit('call-error', { message: 'Authentication required' })
      }

      // Check if receiver is online by verifying if their room has sockets connected
      const receiverRoom = io.sockets.adapter.rooms.get(receiverId)
      const isOnline = receiverRoom && receiverRoom.size > 0

      if (isOnline) {
        console.log(`📞 Signaling: Call from ${callerName} (${callerId}) to ${receiverId}`)
        // Emit incoming-call to receiver
        socket.to(receiverId).emit('incoming-call', {
          callerId,
          callerName,
          callerAvatar,
          channelId,
          callId
        })
      } else {
        console.log(`📞 Signaling: Call target ${receiverId} is offline`)
        socket.emit('call-rejected', {
          callId,
          reason: 'offline',
          message: 'User is offline'
        })
      }
    })

    // WebRTC signaling: Relay offer
    socket.on('offer', (data) => {
      const { targetId, offer } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('offer', {
        senderId,
        offer
      })
    })

    // WebRTC signaling: Relay answer
    socket.on('answer', (data) => {
      const { targetId, answer } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('answer', {
        senderId,
        answer
      })
    })

    // WebRTC signaling: Relay ICE Candidate
    socket.on('ice-candidate', (data) => {
      const { targetId, candidate } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('ice-candidate', {
        senderId,
        candidate
      })
    })

    // Call state: Receiver rejects call
    socket.on('call-rejected', (data) => {
      const { targetId, callId, reason } = data
      socket.to(targetId).emit('call-rejected', {
        callId,
        reason: reason || 'rejected'
      })
    })

    // Call state: Call hung up
    socket.on('call-ended', (data) => {
      const { targetId, callId } = data
      socket.to(targetId).emit('call-ended', {
        callId
      })
    })

    // Call state: Caller cancels outgoing call before pickup
    socket.on('call-cancelled', (data) => {
      const { targetId, callId } = data
      socket.to(targetId).emit('call-cancelled', {
        callId
      })
    })
  })
}
