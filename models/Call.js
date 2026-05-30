const mongoose = require('mongoose')

const callSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['ringing', 'accepted', 'rejected', 'ended', 'missed'],
    default: 'ringing',
    required: true
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  callType: {
    type: String,
    default: 'voice'
  }
}, { timestamps: true })

module.exports = mongoose.model('Call', callSchema)
