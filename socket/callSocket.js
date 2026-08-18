const jwt = require('jsonwebtoken')
const CallHistory = require('../models/CallHistory')
const User = require('../models/User')
const { sendIncomingCallNotification } = require('../utils/pushNotification')

// In-memory socket registries
// userId -> Set<socketId>
const userSockets = new Map()

// socketId -> { adminId, name, email, status }
const adminPresenceRegistry = {}

// Track active call timeouts (callId -> NodeJS.Timeout)
const callTimeouts = new Map()

// Helper: Register socket user
const registerUserSocket = (userId, socketId) => {
  const stringId = userId.toString()
  if (!userSockets.has(stringId)) {
    userSockets.set(stringId, new Set())
  }
  userSockets.get(stringId).add(socketId)
}

// Helper: Unregister socket user
const unregisterUserSocket = (userId, socketId) => {
  if (!userId) return
  const stringId = userId.toString()
  if (userSockets.has(stringId)) {
    const set = userSockets.get(stringId)
    set.delete(socketId)
    if (set.size === 0) {
      userSockets.delete(stringId)
      return true // User is now fully offline
    }
  }
  return false
}

// Helper: Check if user has active connected sockets
const isUserOnline = (userId) => {
  if (!userId) return false
  const stringId = userId.toString()
  const set = userSockets.get(stringId)
  return !!(set && set.size > 0)
}

// Helper: Emit to all sockets of a user
const emitToUser = (io, userId, event, data) => {
  if (!userId) return false
  const stringId = userId.toString()
  const socketSet = userSockets.get(stringId)
  if (socketSet && socketSet.size > 0) {
    socketSet.forEach((sId) => {
      io.to(sId).emit(event, data)
    })
    return true
  }
  return false
}

// Helper: Find available admin for support calls
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
  // Socket Auth Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (token) {
      try {
        let decoded
        try {
          decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET)
        } catch (e) {
          decoded = jwt.verify(token, process.env.JWT_SECRET)
        }
        socket.user = decoded
        socket.userId = decoded.id || decoded._id || decoded.userId
        if (decoded.role === 'admin') {
          socket.isAdmin = true
        }
      } catch (err) {
        console.warn(`[Socket Auth Warning] Invalid token: ${err.message}`)
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    const initialUserId = socket.userId || socket.handshake.query?.userId || 'anonymous'
    console.log(`[Socket Connected] socketId: ${socket.id} | userId: ${initialUserId}`)

    // 1. Join user room
    socket.on('join', (userId) => {
      if (!userId) return
      const stringId = userId.toString()
      socket.userId = stringId
      socket.join(stringId)
      registerUserSocket(stringId, socket.id)

      console.log(`[Socket Joined User Room] socketId: ${socket.id} | userId: ${stringId}`)

      // Broadcast online status to all sockets
      io.emit('user-online', { userId: stringId })
    })

    // 2. Join Admin room & presence registry
    socket.on('joinAdmin', (adminData) => {
      const adminId = adminData?._id || adminData?.id || socket.userId || 'admin_default'
      socket.join('admin-room')
      socket.join(adminId.toString())
      socket.isAdmin = true
      socket.userId = adminId.toString()
      socket.adminData = adminData || { name: 'UBS Admin', email: 'admin@ubsglobal.com' }
      socket.availability = socket.availability || 'AVAILABLE'

      registerUserSocket(socket.userId, socket.id)

      adminPresenceRegistry[socket.id] = {
        socketId: socket.id,
        adminId: socket.userId,
        email: socket.adminData.email || 'admin@ubsglobal.com',
        name: socket.adminData.name || 'UBS Admin',
        status: socket.availability
      }

      console.log(`[Socket Joined Admin Room] socketId: ${socket.id} | adminId: ${socket.userId} | Status: ${socket.availability}`)

      io.emit('user-online', { userId: socket.userId, role: 'admin' })
    })

    // 3. Set availability for support reps
    socket.on('support-call:set-availability', (data) => {
      const { status } = data || {}
      if (['AVAILABLE', 'BUSY'].includes(status)) {
        socket.availability = status
        if (adminPresenceRegistry[socket.id]) {
          adminPresenceRegistry[socket.id].status = status
        }
        console.log(`[Admin Availability Updated] socketId: ${socket.id} | status: ${status}`)
      }
    })

    // -------------------------------------------------------------
    // CALL INITIATION (call-user / support-call:initiate)
    // -------------------------------------------------------------
    socket.on('call-user', async (data) => {
      const {
        receiverId,
        receiverType = 'user',
        callerName,
        callerAvatar,
        channelId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      } = data || {}

      const callerId = socket.userId || data.callerId
      const callerType = socket.isAdmin ? 'admin' : (data.callerType || 'user')

      console.log(`[Call Initiate Triggered] from ${callerId} (${callerType}) to ${receiverId} (${receiverType})`)

      if (!callerId || !receiverId) {
        console.warn('[Call Failed] Missing callerId or receiverId')
        return socket.emit('call-error', { message: 'Caller and receiver details are required' })
      }

      // Check if caller or receiver is in an active call
      try {
        const activeCall = await CallHistory.findOne({
          $or: [
            { callerId: callerId, status: { $in: ['ringing', 'accepted'] } },
            { receiverId: callerId, status: { $in: ['ringing', 'accepted'] } },
            { callerId: receiverId, status: { $in: ['ringing', 'accepted'] } },
            { receiverId: receiverId, status: { $in: ['ringing', 'accepted'] } }
          ]
        })

        if (activeCall) {
          console.warn(`[Call Rejected] User is busy in another call. CallId: ${activeCall._id}`)
          return socket.emit('call-rejected', {
            callId: activeCall._id,
            reason: 'busy',
            message: 'User is currently on another call.'
          })
        }

        // Fetch receiver details if needed
        let receiverUser = null
        if (receiverType !== 'admin') {
          receiverUser = await User.findById(receiverId).select('name avatar expoPushToken')
        }

        // Create call record in CallHistory database
        const callRecord = await CallHistory.create({
          callerId,
          callerName: callerName || socket.adminData?.name || 'Caller',
          callerAvatar: callerAvatar || '',
          callerType,
          receiverId,
          receiverName: receiverUser?.name || data.receiverName || (receiverType === 'admin' ? 'UBS Support' : 'User'),
          receiverAvatar: receiverUser?.avatar || data.receiverAvatar || '',
          receiverType,
          channelId,
          status: 'ringing',
          startTime: new Date()
        })

        const callIdStr = callRecord._id.toString()
        const isReceiverOnline = isUserOnline(receiverId) || (receiverType === 'admin' && Object.keys(adminPresenceRegistry).length > 0)

        const incomingPayload = {
          callId: callIdStr,
          channelId,
          callerId,
          callerName: callRecord.callerName,
          callerAvatar: callRecord.callerAvatar,
          callerType,
          receiverId,
          receiverType
        }

        console.log(`[Offer Sent / Call Ringing] CallId: ${callIdStr} | Receiver Online: ${isReceiverOnline}`)

        // Notify caller that ringing has started
        socket.emit('call-ringing', { callId: callIdStr, channelId })

        if (receiverType === 'admin') {
          // Route to admin room or available admin
          io.to('admin-room').emit('incoming-call', incomingPayload)
          io.to('admin-room').emit('support-call:incoming', incomingPayload)
        } else {
          // Emit incoming-call to user socket rooms
          const delivered = emitToUser(io, receiverId, 'incoming-call', incomingPayload)

          // Fallback / Push notification if not online or delivered
          if (!delivered || !isReceiverOnline) {
            console.log(`[Push Notification Triggered] Target ${receiverId} offline or in background`)
            if (receiverUser?.expoPushToken) {
              sendIncomingCallNotification({
                pushToken: receiverUser.expoPushToken,
                callerName: callRecord.callerName,
                callId: callIdStr,
                channelId,
                callerType
              })
            }
          }
        }

        // Set 30-second call ringing timeout
        const timeoutId = setTimeout(async () => {
          try {
            const ringingCall = await CallHistory.findOne({ _id: callIdStr, status: 'ringing' })
            if (ringingCall) {
              ringingCall.status = 'missed'
              ringingCall.endTime = new Date()
              ringingCall.endedBy = 'system'
              await ringingCall.save()

              console.log(`[Call Timeout] CallId: ${callIdStr} marked as missed`)

              // Notify caller
              emitToUser(io, callerId, 'call-timeout', { callId: callIdStr })
              emitToUser(io, callerId, 'support-call:timeout', { callId: callIdStr })

              // Notify receiver
              if (receiverType === 'admin') {
                io.to('admin-room').emit('call-timeout', { callId: callIdStr })
                io.to('admin-room').emit('support-call:timeout', { callId: callIdStr })
              } else {
                emitToUser(io, receiverId, 'call-timeout', { callId: callIdStr })
              }
            }
          } catch (err) {
            console.error('[Call Timeout Error]', err)
          } finally {
            callTimeouts.delete(callIdStr)
          }
        }, 30000)

        callTimeouts.set(callIdStr, timeoutId)
      } catch (err) {
        console.error('[Initiate Call Database Error]', err)
        socket.emit('call-error', { message: 'Failed to initiate call record' })
      }
    })

    // -------------------------------------------------------------
    // WEBRTC SIGNALING RELAYS
    // -------------------------------------------------------------

    // Offer Relay
    const handleOffer = async (data) => {
      const { targetId, callId, offer } = data || {}
      console.log(`[Offer Sent] callId: ${callId} | targetId: ${targetId}`)

      if (targetId) {
        const delivered = emitToUser(io, targetId, 'offer', { senderId: socket.userId, callId, offer })
        emitToUser(io, targetId, 'support-call:offer', { senderId: socket.userId, callId, offer })
        if (!delivered && targetId === 'admin') {
          io.to('admin-room').emit('offer', { senderId: socket.userId, callId, offer })
          io.to('admin-room').emit('support-call:offer', { senderId: socket.userId, callId, offer })
        }
      }
    }
    socket.on('offer', handleOffer)
    socket.on('support-call:offer', handleOffer)

    // Answer Relay
    const handleAnswer = async (data) => {
      const { targetId, callId, answer } = data || {}
      console.log(`[Answer Sent] callId: ${callId} | targetId: ${targetId}`)

      if (targetId) {
        emitToUser(io, targetId, 'answer', { senderId: socket.userId, callId, answer })
        emitToUser(io, targetId, 'support-call:answer', { senderId: socket.userId, callId, answer })
      }
    }
    socket.on('answer', handleAnswer)
    socket.on('support-call:answer', handleAnswer)

    // ICE Candidate Relay
    const handleIceCandidate = async (data) => {
      const { targetId, callId, candidate } = data || {}
      console.log(`[ICE Candidate Sent] callId: ${callId} | targetId: ${targetId}`)

      if (targetId) {
        emitToUser(io, targetId, 'ice-candidate', { senderId: socket.userId, callId, candidate })
        emitToUser(io, targetId, 'support-call:ice-candidate', { senderId: socket.userId, callId, candidate })
      }
    }
    socket.on('ice-candidate', handleIceCandidate)
    socket.on('support-call:ice-candidate', handleIceCandidate)

    // -------------------------------------------------------------
    // ACCEPT CALL
    // -------------------------------------------------------------
    const handleAcceptCall = async (data) => {
      const { callId, targetId } = data || {}
      console.log(`[Call Accepted] callId: ${callId} | acceptedBy: ${socket.userId}`)

      // Clear ringing timeout
      if (callTimeouts.has(callId)) {
        clearTimeout(callTimeouts.get(callId))
        callTimeouts.delete(callId)
      }

      try {
        const call = await CallHistory.findOneAndUpdate(
          { _id: callId, status: 'ringing' },
          { status: 'accepted', answeredAt: new Date() },
          { new: true }
        )

        if (call) {
          const peerId = targetId || (call.callerId.toString() === socket.userId ? call.receiverId : call.callerId)

          emitToUser(io, peerId.toString(), 'accept-call', { callId, acceptedBy: socket.userId })
          emitToUser(io, peerId.toString(), 'support-call:accepted', { callId, receiverSocketId: socket.id })
          socket.emit('accept-call', { callId, acceptedBy: socket.userId })
        }
      } catch (err) {
        console.error('[Accept Call Error]', err)
      }
    }
    socket.on('accept-call', handleAcceptCall)
    socket.on('support-call:accept', handleAcceptCall)

    // -------------------------------------------------------------
    // REJECT CALL
    // -------------------------------------------------------------
    const handleRejectCall = async (data) => {
      const { callId, targetId, reason = 'rejected' } = data || {}
      console.log(`[Call Rejected] callId: ${callId} | reason: ${reason}`)

      if (callTimeouts.has(callId)) {
        clearTimeout(callTimeouts.get(callId))
        callTimeouts.delete(callId)
      }

      try {
        const call = await CallHistory.findOneAndUpdate(
          { _id: callId, status: 'ringing' },
          { status: 'rejected', endTime: new Date(), endedBy: 'receiver' },
          { new: true }
        )

        const peerId = targetId || (call ? call.callerId : null)
        if (peerId) {
          emitToUser(io, peerId.toString(), 'call-rejected', { callId, reason })
          emitToUser(io, peerId.toString(), 'support-call:rejected', { callId, reason })
        }
      } catch (err) {
        console.error('[Reject Call Error]', err)
      }
    }
    socket.on('reject-call', handleRejectCall)
    socket.on('support-call:reject', handleRejectCall)

    // -------------------------------------------------------------
    // END CALL
    // -------------------------------------------------------------
    const handleEndCall = async (data) => {
      const { callId, targetId, endedBy = 'user' } = data || {}
      console.log(`[Call Ended] callId: ${callId} by ${socket.userId}`)

      if (callTimeouts.has(callId)) {
        clearTimeout(callTimeouts.get(callId))
        callTimeouts.delete(callId)
      }

      try {
        const call = await CallHistory.findById(callId)
        if (call && ['ringing', 'accepted'].includes(call.status)) {
          const endTime = new Date()
          call.status = 'completed'
          call.endTime = endTime
          call.endedBy = endedBy

          if (call.answeredAt) {
            call.duration = Math.round((endTime.getTime() - call.answeredAt.getTime()) / 1000)
          }
          await call.save()
        }

        const peerId = targetId || (call ? (call.callerId.toString() === socket.userId ? call.receiverId : call.callerId) : null)
        if (peerId) {
          emitToUser(io, peerId.toString(), 'call-ended', { callId })
          emitToUser(io, peerId.toString(), 'support-call:ended', { callId })
        }
      } catch (err) {
        console.error('[End Call Error]', err)
      }
    }
    socket.on('end-call', handleEndCall)
    socket.on('support-call:end', handleEndCall)

    // -------------------------------------------------------------
    // DISCONNECT
    // -------------------------------------------------------------
    socket.on('disconnect', async () => {
      console.log(`[Socket Disconnected] socketId: ${socket.id} | userId: ${socket.userId}`)

      if (socket.isAdmin) {
        delete adminPresenceRegistry[socket.id]
      }

      const isOfflineNow = unregisterUserSocket(socket.userId, socket.id)
      if (isOfflineNow) {
        console.log(`[User Fully Offline] userId: ${socket.userId}`)
        io.emit('user-offline', { userId: socket.userId })
      }
    })
  })
}

module.exports = {
  socketHandler,
  adminPresenceRegistry,
  getAvailableAdmin,
  userSockets,
  isUserOnline
}
