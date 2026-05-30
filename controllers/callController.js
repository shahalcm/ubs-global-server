const Call = require('../models/Call')
const User = require('../models/User')
const Seller = require('../models/Seller')
const crypto = require('crypto')

// Initiate a call record
exports.initiateCall = async (req, res) => {
  try {
    const { receiverId } = req.body
    const callerId = req.user._id

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'Receiver ID is required' })
    }

    // Resolve receiver's User ID (if receiverId is a Seller ID instead of User ID)
    let targetUserId = receiverId
    const seller = await Seller.findById(receiverId)
    if (seller) {
      targetUserId = seller.userId
    }

    // Verify receiver exists in User database
    const receiverUser = await User.findById(targetUserId)
    if (!receiverUser) {
      return res.status(404).json({ success: false, message: 'Receiver user not found' })
    }

    // Generate unique channelId/room name for WebRTC session
    const channelId = `call_${crypto.randomBytes(8).toString('hex')}`

    const newCall = await Call.create({
      callerId,
      receiverId: targetUserId,
      status: 'ringing',
      channelId
    })

    res.status(201).json({
      success: true,
      call: {
        _id: newCall._id,
        channelId: newCall.channelId,
        status: newCall.status,
        callerId: newCall.callerId,
        receiverId: newCall.receiverId,
        createdAt: newCall.createdAt
      },
      receiver: {
        _id: receiverUser._id,
        name: receiverUser.name,
        avatar: receiverUser.avatar,
        role: receiverUser.role
      }
    })
  } catch (error) {
    console.error('Initiate call error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update call status
exports.updateCallStatus = async (req, res) => {
  try {
    const { callId } = req.params
    const { status } = req.body

    const allowedStatuses = ['ringing', 'accepted', 'rejected', 'ended', 'missed']
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid call status' })
    }

    const call = await Call.findById(callId)
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call record not found' })
    }

    // Verify authorization: caller or receiver must belong to the call
    if (call.callerId.toString() !== req.user._id.toString() && call.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to call' })
    }

    call.status = status

    if (status === 'accepted') {
      call.startTime = new Date()
    } else if (status === 'ended') {
      call.endTime = new Date()
      if (call.startTime) {
        call.duration = Math.round((call.endTime - call.startTime) / 1000)
      }
    } else if (status === 'rejected' || status === 'missed') {
      call.endTime = new Date()
    }

    await call.save()

    res.json({ success: true, call })
  } catch (error) {
    console.error('Update call status error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get user call logs history
exports.getCallHistory = async (req, res) => {
  try {
    const userId = req.user._id

    const calls = await Call.find({
      $or: [
        { callerId: userId },
        { receiverId: userId }
      ]
    })
      .populate('callerId', 'name avatar role')
      .populate('receiverId', 'name avatar role')
      .sort({ createdAt: -1 })
      .limit(50)

    res.json({ success: true, calls })
  } catch (error) {
    console.error('Get call history error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}
