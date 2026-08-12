const mongoose = require('mongoose')

const supportCallSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  callerRole: {
    type: String,
    enum: ['buyer', 'seller', 'user'],
    default: 'buyer',
    required: true
  },
  callerName: {
    type: String,
    required: true
  },
  callerAvatar: {
    type: String
  },
  receiverId: {
    type: String,
    default: 'admin',
    required: true
  },
  receiverSocketId: {
    type: String
  },
  status: {
    type: String,
    enum: ['ringing', 'accepted', 'rejected', 'ended', 'missed', 'cancelled', 'failed'],
    default: 'ringing',
    required: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  callType: {
    type: String,
    default: 'AUDIO',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  answeredAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number,
    default: 0
  },
  endedBy: {
    type: String,
    enum: ['caller', 'receiver', 'system', '']
  }
}, { timestamps: true })

supportCallSchema.index({ callerId: 1 })
supportCallSchema.index({ receiverId: 1 })
supportCallSchema.index({ status: 1 })
supportCallSchema.index({ channelId: 1 })

module.exports = mongoose.model('SupportCall', supportCallSchema)
