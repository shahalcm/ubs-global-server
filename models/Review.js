const mongoose = require('mongoose')
const reviewSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  rating: { type: Number, min: 1, max: 5 },
  title: String,
  comment: String,
  images: [String],
  isVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: true },
  isFlagged: { type: Boolean, default: false },
  flagReason: String,
  helpfulCount: { type: Number, default: 0 },
}, { timestamps: true })
module.exports = mongoose.model('Review', reviewSchema)