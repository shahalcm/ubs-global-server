const adminPresenceRegistry = {} // socketId -> { adminId, name, email, status, socket }

const getAvailableAdmin = () => {
  const keys = Object.keys(adminPresenceRegistry)
  for (const key of keys) {
    const admin = adminPresenceRegistry[key]
    if (admin.status === 'AVAILABLE') {
      return admin
    }
  }
  return null
}

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    
    // Register or update userId when user joins
    socket.on('join', (userId) => {
      socket.userId = userId
      socket.join(userId)
    })

    // Handle Admin connection join
    socket.on('joinAdmin', (adminData) => {
      socket.join('admin-room')
      socket.isAdmin = true
      socket.userId = adminData?._id || 'admin_default'
      socket.adminData = adminData || { name: 'UBS Admin', email: 'admin@ubsglobal.com' }
      socket.availability = socket.availability || 'AVAILABLE'

      adminPresenceRegistry[socket.id] = {
        socketId: socket.id,
        adminId: socket.userId,
        email: socket.adminData.email,
        name: socket.adminData.name,
        status: socket.availability,
        socket: socket
      }
      console.log(`💻 Admin socket joined: ${socket.id} (Status: ${socket.availability})`)
    })

    // Update Admin availability status
    socket.on('support-call:set-availability', (data) => {
      const { status } = data
      if (['AVAILABLE', 'BUSY'].includes(status)) {
        socket.availability = status
        if (adminPresenceRegistry[socket.id]) {
          adminPresenceRegistry[socket.id].status = status
        }
        console.log(`💻 Admin socket ${socket.id} availability set to: ${status}`)
      }
    })

    // Initiate voice call to receiver (user-to-user)
    socket.on('call-user', (data) => {
      const { receiverId, callerName, callerAvatar, channelId, callId } = data
      const callerId = socket.userId || data.callerId

      if (!callerId) {
        console.warn('⚠️ Call failed: Caller not authenticated on socket')
        return socket.emit('call-error', { message: 'Authentication required' })
      }

      const receiverRoom = io.sockets.adapter.rooms.get(receiverId)
      const isOnline = receiverRoom && receiverRoom.size > 0

      if (isOnline) {
        console.log(`📞 User Signaling: Call from ${callerName} (${callerId}) to ${receiverId}`)
        socket.to(receiverId).emit('incoming-call', {
          callerId,
          callerName,
          callerAvatar,
          channelId,
          callId
        })
      } else {
        console.log(`📞 User Signaling: Call target ${receiverId} is offline`)
        socket.emit('call-rejected', {
          callId,
          reason: 'offline',
          message: 'User is offline'
        })
      }
    })

    // WebRTC user-to-user signaling relays
    socket.on('offer', (data) => {
      const { targetId, offer } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('offer', {
        senderId,
        offer
      })
    })

    socket.on('answer', (data) => {
      const { targetId, answer } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('answer', {
        senderId,
        answer
      })
    })

    socket.on('ice-candidate', (data) => {
      const { targetId, candidate } = data
      const senderId = socket.userId || data.senderId
      socket.to(targetId).emit('ice-candidate', {
        senderId,
        candidate
      })
    })

    socket.on('call-rejected', (data) => {
      const { targetId, callId, reason } = data
      socket.to(targetId).emit('call-rejected', {
        callId,
        reason: reason || 'rejected'
      })
    })

    socket.on('call-ended', (data) => {
      const { targetId, callId } = data
      socket.to(targetId).emit('call-ended', {
        callId
      })
    })

    socket.on('call-cancelled', (data) => {
      const { targetId, callId } = data
      socket.to(targetId).emit('call-cancelled', {
        callId
      })
    })

    // -------------------------------------------------------------
    // App-to-Admin Support Call Signaling Relays with IDOR Security Check
    // -------------------------------------------------------------

    const getCallAndVerify = async (callId) => {
      try {
        const SupportCall = require('../models/SupportCall')
        const call = await SupportCall.findById(callId)
        if (!call) return null

        const isCaller = call.callerId.toString() === (socket.userId || '')
        const isReceiver = call.receiverSocketId === socket.id

        if (!isCaller && !isReceiver) {
          console.warn(`🔒 Security Alert: Unauthorized WebRTC attempt on call ${callId} by socket ${socket.id}`)
          return null
        }
        return { call, isCaller, isReceiver }
      } catch (err) {
        console.error('getCallAndVerify error:', err)
        return null
      }
    }

    socket.on('support-call:offer', async (data) => {
      const { callId, offer } = data
      const verified = await getCallAndVerify(callId)
      if (!verified) return

      const targetSocketId = verified.isCaller ? verified.call.receiverSocketId : verified.call.callerId.toString()
      socket.to(targetSocketId).emit('support-call:offer', {
        callId,
        offer
      })
    })

    socket.on('support-call:answer', async (data) => {
      const { callId, answer } = data
      const verified = await getCallAndVerify(callId)
      if (!verified) return

      const targetSocketId = verified.isCaller ? verified.call.receiverSocketId : verified.call.callerId.toString()
      socket.to(targetSocketId).emit('support-call:answer', {
        callId,
        answer
      })
    })

    socket.on('support-call:ice-candidate', async (data) => {
      const { callId, candidate } = data
      const verified = await getCallAndVerify(callId)
      if (!verified) return

      const targetSocketId = verified.isCaller ? verified.call.receiverSocketId : verified.call.callerId.toString()
      socket.to(targetSocketId).emit('support-call:ice-candidate', {
        callId,
        candidate
      })
    })

    socket.on('support-call:end', async (data) => {
      const { callId } = data
      const verified = await getCallAndVerify(callId)
      if (!verified) return

      // Terminate call lifecycle using controller method logic
      const targetSocketId = verified.isCaller ? verified.call.receiverSocketId : verified.call.callerId.toString()
      socket.to(targetSocketId).emit('support-call:ended', { callId })
    })

    // Handle Disconnection
    socket.on('disconnect', async () => {
      console.log('🔌 Socket disconnected:', socket.id)
      
      if (socket.isAdmin) {
        delete adminPresenceRegistry[socket.id]
        console.log(`💻 Removed admin presence for socket ${socket.id}`)

        // If admin disconnected during active support call, mark it failed / ended
        try {
          const SupportCall = require('../models/SupportCall')
          const activeCall = await SupportCall.findOne({
            receiverSocketId: socket.id,
            status: { $in: ['ringing', 'accepted'] }
          })
          if (activeCall) {
            activeCall.status = 'failed'
            activeCall.endedAt = new Date()
            activeCall.endedBy = 'receiver'
            await activeCall.save()

            // Notify user
            io.to(activeCall.callerId.toString()).emit('support-call:ended', {
              callId: activeCall._id,
              message: 'Call failed: Admin disconnected'
            })
          }
        } catch (err) {
          console.error('Failed to clean up active support call on disconnect:', err)
        }
      }
    })
  })
}

module.exports = {
  socketHandler,
  adminPresenceRegistry,
  getAvailableAdmin
}
