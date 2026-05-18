const mongoose = require('mongoose')

const withdrawalSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  type: {
    type: String,
    enum: ['seller', 'admin'],
    required: true
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String,
    upiId: String,
    accountHolderName: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending'
  },
  adminNote: String,
  processedAt: Date,
  completedAt: Date,
  razorpayTransferId: String
}, { timestamps: true })

module.exports = mongoose.model('Withdrawal', withdrawalSchema)
