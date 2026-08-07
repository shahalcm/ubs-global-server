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
  preferredDisplayCurrency: {
    type: String,
    enum: ['USD', 'INR', 'EUR', 'GBP', 'AED'],
    default: 'USD'
  },
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
  businessName: String,
  gstNumber: String,
  panNumber: String,
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'unsubmitted'],
    default: 'unsubmitted'
  },
  kycDocuments: {
    panCard: String,
    gstCertificate: String,
    addressProof: String
  },
  warehouseAddress: {
    address: String,
    address_2: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pin_code: String,
    phone: String,
    email: String
  },
  pickupAddresses: [{
    pickup_location: { type: String, required: true }, // Shiprocket unique identifier tag
    name: String,
    email: String,
    phone: String,
    address: String,
    address_2: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pin_code: String,
    isDefault: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }
  }],
  returnAddress: {
    address: String,
    address_2: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pin_code: String,
    phone: String,
    email: String
  },
  primaryPhone: String,
  businessEmail: String,
  businessVerificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified'
  },
  website: String,
  categories: String,
  yearEstablished: String,
  description: String,
  adminNote: String,
  status: {
    type: String,
    enum: ['pending','approved','rejected','suspended'],
    default: 'pending'
  },
  isVerified: { type: Boolean, default: false },
  registrationFeePaid: { type: Boolean, default: false },
  registrationFeeAmount: { type: Number, default: 10 },
  registrationFeeTransactionId: String,
  subscriptionPlan: { type: String, default: 'Yearly' },
  subscriptionFee: { type: Number, default: 10 },
  subscriptionStatus: { type: String, enum: ['active', 'inactive', 'expired'], default: 'inactive' },
  subscriptionExpiresAt: Date,
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
    upiId: String,
    accountHolderName: String
  },
  fcmToken: String,
  memberSince: { type: Date, default: Date.now },
  responseRate: { type: Number, default: 100 },
}, { timestamps: true })
module.exports = mongoose.model('Seller', sellerSchema)