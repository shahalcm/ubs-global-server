const mongoose = require('mongoose')

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'pieces' },
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  expectedDelivery: { type: Date },
  validUntil: { type: Date },
  notes: { type: String },
  status: {
    type: String,
    enum: ['SENT', 'ACCEPTED', 'REJECTED'],
    default: 'SENT'
  },
  rejectionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
}, { _id: false })

const directEnquirySchema = new mongoose.Schema({
  enquiryNumber: {
    type: String,
    unique: true,
    required: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unit: {
    type: String,
    default: 'pieces'
  },
  variant: {
    type: String,
    trim: true
  },
  targetPrice: {
    type: Number
  },
  deliveryLocation: {
    type: String,
    required: true,
    trim: true
  },
  requiredDeliveryDate: {
    type: Date
  },
  initialMessage: {
    type: String,
    required: true
  },
  attachments: [{
    url: String,
    name: String,
    fileType: String,
    size: Number
  }],
  status: {
    type: String,
    enum: [
      'PENDING',
      'ADMIN_REVIEWING',
      'IN_DISCUSSION',
      'QUOTATION_SENT',
      'ACCEPTED',
      'REJECTED',
      'CLOSED'
    ],
    default: 'PENDING',
    index: true
  },
  assignedAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    index: true
  },
  assignedAdminName: {
    type: String
  },
  quotation: quotationSchema,
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  lastMessage: {
    type: String
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageBy: {
    type: String,
    enum: ['buyer', 'admin']
  },
  buyerUnreadCount: {
    type: Number,
    default: 0
  },
  adminUnreadCount: {
    type: Number,
    default: 0
  },
  auditLog: [{
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    performedById: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
})

// Compound Indexes for fast listing and filtering
directEnquirySchema.index({ buyerId: 1, createdAt: -1 })
directEnquirySchema.index({ status: 1, createdAt: -1 })
directEnquirySchema.index({ assignedAdminId: 1, status: 1 })
directEnquirySchema.index({ sellerId: 1, createdAt: -1 })

module.exports = mongoose.model('DirectEnquiry', directEnquirySchema)
