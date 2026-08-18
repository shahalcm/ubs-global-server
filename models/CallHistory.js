const mongoose = require('mongoose')

const callHistorySchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  callerName: {
    type: String,
    default: 'Anonymous'
  },
  callerAvatar: {
    type: String,
    default: ''
  },
  callerType: {
    type: String,
    enum: ['admin', 'user', 'seller'],
    default: 'user',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  receiverName: {
    type: String,
    default: 'User'
  },
  receiverAvatar: {
    type: String,
    default: ''
  },
  receiverType: {
    type: String,
    enum: ['admin', 'user', 'seller'],
    default: 'user',
    required: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  callType: {
    type: String,
    default: 'audio'
  },
  status: {
    type: String,
    enum: ['ringing', 'accepted', 'missed', 'completed', 'rejected', 'cancelled'],
    default: 'ringing',
    required: true,
    index: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  answeredAt: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  endedBy: {
    type: String, // 'caller' | 'receiver' | 'system'
    default: ''
  }
}, { timestamps: true })

callHistorySchema.index({ callerId: 1, createdAt: -1 })
callHistorySchema.index({ receiverId: 1, createdAt: -1 })
callHistorySchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('CallHistory', callHistorySchema)
