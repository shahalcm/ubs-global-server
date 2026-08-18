const CallHistory = require('../models/CallHistory')
const User = require('../models/User')
const Seller = require('../models/Seller')
const crypto = require('crypto')

// Initiate call
exports.initiateCall = async (req, res) => {
  try {
    const { receiverId, receiverType = 'user' } = req.body
    const callerId = req.user?._id || req.admin?._id || req.body.callerId
    const callerType = req.admin ? 'admin' : (req.user?.role || 'user')

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'Receiver ID is required' })
    }

    let targetUserId = receiverId
    let targetName = 'User'
    let targetAvatar = ''

    if (receiverType === 'seller') {
      const seller = await Seller.findById(receiverId).populate('userId')
      if (seller && seller.userId) {
        targetUserId = seller.userId._id
        targetName = seller.storeName || seller.userId.name
        targetAvatar = seller.logo || seller.userId.avatar
      }
    } else if (receiverType === 'user') {
      const receiverUser = await User.findById(receiverId)
      if (receiverUser) {
        targetName = receiverUser.name
        targetAvatar = receiverUser.avatar
      }
    }

    const channelId = `call_${crypto.randomBytes(8).toString('hex')}`

    const newCall = await CallHistory.create({
      callerId,
      callerName: req.user?.name || req.admin?.name || 'Caller',
      callerAvatar: req.user?.avatar || '',
      callerType,
      receiverId: targetUserId,
      receiverName: targetName,
      receiverAvatar: targetAvatar,
      receiverType,
      status: 'ringing',
      channelId
    })

    res.status(201).json({
      success: true,
      call: newCall
    })
  } catch (error) {
    console.error('Initiate call error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get paginated call history (for Admin & User)
exports.getCallHistory = async (req, res) => {
  try {
    const { search, status, callerType, receiverType, startDate, endDate, page = 1, limit = 50 } = req.query
    let query = {}

    // User access restriction (non-admin can only view their own calls)
    if (req.user && !req.admin) {
      query.$or = [
        { callerId: req.user._id },
        { receiverId: req.user._id }
      ]
    }

    if (status) {
      query.status = status
    }

    if (callerType) {
      query.callerType = callerType
    }

    if (receiverType) {
      query.receiverType = receiverType
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i')
      query.$or = [
        { callerName: searchRegex },
        { receiverName: searchRegex }
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const calls = await CallHistory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await CallHistory.countDocuments(query)

    res.json({
      success: true,
      calls,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Get call history error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get active ongoing calls for admin monitoring
exports.getActiveCalls = async (req, res) => {
  try {
    const activeCalls = await CallHistory.find({
      status: { $in: ['ringing', 'accepted'] }
    }).sort({ createdAt: -1 })

    res.json({ success: true, calls: activeCalls })
  } catch (error) {
    console.error('Get active calls error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Register Expo Push Token for mobile users
exports.registerPushToken = async (req, res) => {
  try {
    const { pushToken } = req.body
    if (!pushToken) {
      return res.status(400).json({ success: false, message: 'Push token is required' })
    }

    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { expoPushToken: pushToken })
    }

    res.json({ success: true, message: 'Expo push token registered successfully' })
  } catch (error) {
    console.error('Register push token error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update call status directly
exports.updateCallStatus = async (req, res) => {
  try {
    const { callId } = req.params
    const { status } = req.body

    const call = await CallHistory.findById(callId)
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call not found' })
    }

    call.status = status
    if (status === 'accepted') {
      call.answeredAt = new Date()
    } else if (['completed', 'ended', 'rejected', 'cancelled', 'missed'].includes(status)) {
      call.endTime = new Date()
      if (call.answeredAt) {
        call.duration = Math.round((call.endTime - call.answeredAt) / 1000)
      }
    }
    await call.save()

    res.json({ success: true, call })
  } catch (error) {
    console.error('Update call status error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}
