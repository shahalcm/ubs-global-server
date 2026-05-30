const mongoose = require('mongoose')
const messageSchema = new mongoose.Schema({
  chatRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  senderType: {
    type: String,
    enum: ['buyer', 'seller', 'admin', 'bot'],
    required: true
  },
  senderName: String,
  senderAvatar: String,
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'product', 'offer'],
    default: 'text'
  },
  text: String,
  imageUrl: String,
  fileUrl: String,
  fileName: String,
  productCard: {
    productId: String,
    productName: String,
    productImage: String,
    price: String
  },
  offerDetails: {
    quantity: Number,
    price: String,
    notes: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  isDeleted: { type: Boolean, default: false },
  isBot: {
    type: Boolean,
    default: false
  },
  isTakeover: {
    type: Boolean,
    default: false
  },
  botSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BotSession'
  }
}, { timestamps: true })
module.exports = mongoose.model('Message', messageSchema)
