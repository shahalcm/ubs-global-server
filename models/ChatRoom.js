const mongoose = require('mongoose')
const chatRoomSchema = new mongoose.Schema({
  contactRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContactRequest'
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  roomName: String,
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  adminMonitoring: { type: Boolean, default: true },
  lastMessage: String,
  lastMessageAt: Date,
  lastMessageBy: String,
  buyerUnread: { type: Number, default: 0 },
  sellerUnread: { type: Number, default: 0 },
  adminUnread: { type: Number, default: 0 }
}, { timestamps: true })
module.exports = mongoose.model('ChatRoom', chatRoomSchema)
