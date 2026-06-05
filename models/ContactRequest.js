const mongoose = require('mongoose')
const contactRequestSchema = new mongoose.Schema({
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerName: String,
  buyerEmail: String,
  buyerPhone: String,
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: false
  },
  sellerName: String,
  sellerShop: String,
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: String,
  productImage: String,
  subject: String,
  message: String,
  requestType: {
    type: String,
    enum: [
      'product_inquiry',
      'bulk_order',
      'custom_order',
      'shipping_inquiry',
      'price_negotiation',
      'other'
    ],
    default: 'product_inquiry'
  },
  quantity: Number,
  budget: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'connected'],
    default: 'pending'
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  adminNote: String,
  reviewedAt: Date,
  connectedAt: Date,
  chatRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  },
  isUrgent: { type: Boolean, default: false },
  isBulkOrder: { type: Boolean, default: false }
}, { timestamps: true })
module.exports = mongoose.model('ContactRequest', contactRequestSchema)
