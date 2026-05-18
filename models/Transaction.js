const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderNumber: String,
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  grossAmount: Number,
  commissionPercent: Number,
  commissionAmount: Number,
  sellerEarnings: Number,
  adminEarnings: Number,
  currency: {
    type: String,
    default: 'USD'
  },
  paymentMethod: String,
  razorpayPaymentId: String,
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paidAt: Date
}, { timestamps: true })

module.exports = mongoose.model('Transaction', transactionSchema)