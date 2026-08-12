const SupportCall = require('../models/SupportCall')
const User = require('../models/User')
const crypto = require('crypto')

// Helper to get available admin from callSocket registry
const getAvailableAdminHelper = () => {
  try {
    const callSocket = require('../socket/callSocket')
    if (callSocket && typeof callSocket.getAvailableAdmin === 'function') {
      return callSocket.getAvailableAdmin()
    }
  } catch (err) {
    console.error('Failed to require callSocket helper:', err)
  }
  return null
}

const getRegistryHelper = () => {
  try {
    const callSocket = require('../socket/callSocket')
    if (callSocket && callSocket.adminPresenceRegistry) {
      return callSocket.adminPresenceRegistry
    }
  } catch (err) {
    console.error('Failed to get admin registry:', err)
  }
  return {}
}

// Initiate a support call request
exports.initiateSupportCall = async (req, res) => {
  try {
    const callerId = req.user._id
    const callerRole = req.user.role || 'buyer'
    const callerName = req.user.name || 'Anonymous User'
    const callerAvatar = req.user.avatar || ''

    // 1. Check duplicate active calls
    const existingCall = await SupportCall.findOne({
      callerId,
      status: { $in: ['ringing', 'accepted'] }
    })

    if (existingCall) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active support call.'
      })
    }

    // 2. Check admin presence registry
    const registry = getRegistryHelper()
    const onlineAdminsCount = Object.keys(registry).length

    if (onlineAdminsCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No support agents are currently available.'
      })
    }

    const assignedAdmin = getAvailableAdminHelper()
    if (!assignedAdmin) {
      return res.status(423).json({
        success: false,
        message: 'All support agents are currently busy.'
      })
    }

    // 3. Create the call record
    const channelId = `support_call_${crypto.randomBytes(8).toString('hex')}`
    const call = await SupportCall.create({
      callerId,
      callerRole,
      callerName,
      callerAvatar,
      receiverId: assignedAdmin.adminId || 'admin',
      receiverSocketId: assignedAdmin.socketId,
      status: 'ringing',
      channelId
    })

    // Mark the assigned admin socket as RINGING
    assignedAdmin.status = 'RINGING'

    // 4. Emit incoming call event to admin socket
    if (global.io) {
      global.io.to(assignedAdmin.socketId).emit('support-call:incoming', {
        callId: call._id,
        channelId,
        callerId,
        callerName,
        callerRole,
        callerAvatar
      })
    }

    // 5. Setup call timeout (30 seconds)
    setTimeout(async () => {
      try {
        const ringingCall = await SupportCall.findOne({ _id: call._id, status: 'ringing' })
        if (ringingCall) {
          ringingCall.status = 'missed'
          ringingCall.endedAt = new Date()
          ringingCall.endedBy = 'system'
          await ringingCall.save()

          // Reset admin presence
          if (registry[assignedAdmin.socketId]) {
            registry[assignedAdmin.socketId].status = 'AVAILABLE'
          }

          if (global.io) {
            // Notify admin to stop ringing
            global.io.to(assignedAdmin.socketId).emit('support-call:timeout', { callId: call._id })
            // Notify user
            global.io.to(callerId.toString()).emit('support-call:timeout', { callId: call._id })
          }
        }
      } catch (err) {
        console.error('Call timeout execution failed:', err)
      }
    }, 30000)

    res.status(201).json({
      success: true,
      call: {
        _id: call._id,
        channelId: call.channelId,
        status: call.status
      }
    })
  } catch (error) {
    console.error('Initiate support call error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// Accept support call
exports.acceptSupportCall = async (req, res) => {
  try {
    const { callId } = req.params
    const { socketId } = req.body

    if (!socketId) {
      return res.status(400).json({ success: false, message: 'Admin Socket ID is required' })
    }

    // Atomically find ringing call and update to accepted
    const call = await SupportCall.findOneAndUpdate(
      { _id: callId, status: 'ringing' },
      {
        status: 'accepted',
        receiverSocketId: socketId,
        answeredAt: new Date()
      },
      { new: true }
    )

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call is no longer active or has already been accepted.'
      })
    }

    // Update admin status to BUSY in presence registry
    const registry = getRegistryHelper()
    if (registry[socketId]) {
      registry[socketId].status = 'BUSY'
    }

    // Emit accept confirmation to user room
    if (global.io) {
      global.io.to(call.callerId.toString()).emit('support-call:accepted', {
        callId: call._id,
        channelId: call.channelId,
        receiverSocketId: socketId
      })
    }

    res.json({ success: true, call })
  } catch (error) {
    console.error('Accept support call error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// Reject incoming support call
exports.rejectSupportCall = async (req, res) => {
  try {
    const { callId } = req.params

    const call = await SupportCall.findOneAndUpdate(
      { _id: callId, status: 'ringing' },
      {
        status: 'rejected',
        endedAt: new Date(),
        endedBy: 'receiver'
      },
      { new: true }
    )

    if (!call) {
      return res.status(404).json({ success: false, message: 'Call is not ringing' })
    }

    // Reset admin status to AVAILABLE in registry
    const registry = getRegistryHelper()
    if (call.receiverSocketId && registry[call.receiverSocketId]) {
      registry[call.receiverSocketId].status = 'AVAILABLE'
    }

    // Emit reject to caller user
    if (global.io) {
      global.io.to(call.callerId.toString()).emit('support-call:rejected', {
        callId: call._id,
        message: 'Support call declined.'
      })
    }

    res.json({ success: true, call })
  } catch (error) {
    console.error('Reject support call error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// Cancel support call
exports.cancelSupportCall = async (req, res) => {
  try {
    const { callId } = req.params

    const call = await SupportCall.findById(callId)
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call record not found' })
    }

    // IDOR protection: only caller can cancel
    if (call.callerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized operation' })
    }

    if (call.status !== 'ringing') {
      return res.status(400).json({ success: false, message: 'Call is not ringing' })
    }

    call.status = 'cancelled'
    call.endedAt = new Date()
    call.endedBy = 'caller'
    await call.save()

    // Reset admin availability in registry
    const registry = getRegistryHelper()
    if (call.receiverSocketId && registry[call.receiverSocketId]) {
      registry[call.receiverSocketId].status = 'AVAILABLE'
    }

    // Emit cancel event to admin socket
    if (global.io && call.receiverSocketId) {
      global.io.to(call.receiverSocketId).emit('support-call:cancelled', {
        callId: call._id
      })
    }

    res.json({ success: true, call })
  } catch (error) {
    console.error('Cancel support call error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// End support call
exports.endSupportCall = async (req, res) => {
  try {
    const { callId } = req.params
    const { endedBy } = req.body // 'caller' | 'receiver'

    const call = await SupportCall.findById(callId)
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call record not found' })
    }

    // IDOR protection: verify sender participates in the call
    const isCaller = call.callerId.toString() === (req.user?._id?.toString() || '')
    const isAdmin = req.admin !== undefined // Admin token validated

    if (!isCaller && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized to end call' })
    }

    if (['ended', 'cancelled', 'rejected', 'failed'].includes(call.status)) {
      return res.json({ success: true, message: 'Call already terminated', call })
    }

    const previousStatus = call.status
    call.status = 'ended'
    call.endedAt = new Date()
    call.endedBy = endedBy || (isCaller ? 'caller' : 'receiver')

    if (call.answeredAt) {
      call.duration = Math.round((call.endedAt - call.answeredAt) / 1000)
    }

    await call.save()

    // Reset admin availability in registry
    const registry = getRegistryHelper()
    if (call.receiverSocketId && registry[call.receiverSocketId]) {
      registry[call.receiverSocketId].status = 'AVAILABLE'
    }

    // Emit end call signal to peers
    if (global.io) {
      if (isCaller && call.receiverSocketId) {
        global.io.to(call.receiverSocketId).emit('support-call:ended', { callId: call._id })
      } else if (isAdmin && call.callerId) {
        global.io.to(call.callerId.toString()).emit('support-call:ended', { callId: call._id })
      }
    }

    res.json({ success: true, call })
  } catch (error) {
    console.error('End support call error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// Fetch support call history (secured: users get theirs, admins get all)
exports.getSupportCallHistory = async (req, res) => {
  try {
    let query = {}
    if (req.user) {
      // User is client, filter by ownership
      query = { callerId: req.user._id }
    } else if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }

    const history = await SupportCall.find(query)
      .populate('callerId', 'name email phone avatar role')
      .sort({ createdAt: -1 })
      .limit(50)

    res.json({ success: true, history })
  } catch (error) {
    console.error('Get support call history error:', error)
    res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
