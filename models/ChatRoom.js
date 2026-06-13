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
    refPath: 'sellerModel'
  },
  sellerModel: {
    type: String,
    enum: ['Seller', 'User'],
    default: 'Seller'
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
  meta: {
    type: mongoose.Schema.Types.Mixed
  },
  lastMessage: String,
  lastMessageAt: Date,
  lastMessageBy: String,
  buyerUnread: { type: Number, default: 0 },
  sellerUnread: { type: Number, default: 0 },
  adminUnread: { type: Number, default: 0 },
  isDeletedByBuyer: { type: Boolean, default: false },
  isDeletedBySeller: { type: Boolean, default: false }
}, { timestamps: true })
module.exports = mongoose.model('ChatRoom', chatRoomSchema)
