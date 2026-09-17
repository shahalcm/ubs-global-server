const mongoose = require('mongoose')

const enquiryMessageSchema = new mongoose.Schema({
  enquiryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectEnquiry',
    required: true,
    index: true
  },
  senderType: {
    type: String,
    enum: ['buyer', 'admin', 'system'],
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  senderName: {
    type: String,
    default: ''
  },
  senderAvatar: {
    type: String,
    default: ''
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'document', 'quotation', 'status_change'],
    default: 'text'
  },
  text: {
    type: String,
    default: ''
  },
  attachments: [{
    url: String,
    name: String,
    fileType: String,
    size: Number
  }],
  quotationData: {
    type: mongoose.Schema.Types.Mixed
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
})

enquiryMessageSchema.index({ enquiryId: 1, createdAt: 1 })

module.exports = mongoose.model('EnquiryMessage', enquiryMessageSchema)
