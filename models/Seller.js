const mongoose = require('mongoose')
const sellerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shopName: { type: String, required: true },
  ownerName: { type: String, required: true },
  email: String,
  phone: String,
  businessType: {
    type: String,
    enum: [
      'Importer','Exporter',
      'Both','Retailer','Wholesaler'
    ]
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  shopLogo: String,
  idProof: String,
  description: String,
  adminNote: String,
  status: {
    type: String,
    enum: ['pending','approved','rejected','suspended'],
    default: 'pending'
  },
  isVerified: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  pendingWithdrawal: { type: Number, default: 0 },
  withdrawnAmount: { type: Number, default: 0 },
  commission: { type: Number, default: 8 },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String,
    upiId: String
  },
  fcmToken: String,
  memberSince: { type: Date, default: Date.now },
  responseRate: { type: Number, default: 100 },
}, { timestamps: true })
module.exports = mongoose.model('Seller', sellerSchema)