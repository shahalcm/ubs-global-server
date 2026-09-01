const mongoose = require('mongoose')

const crmSegmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  targetType: {
    type: String,
    enum: ['CUSTOMER', 'SELLER'],
    required: true
  },
  filters: {
    country: [String],
    status: [String],
    minOrders: Number,
    maxOrders: Number,
    minSpend: Number,
    maxSpend: Number,
    kycStatus: [String],
    lastActiveDays: Number
  },
  memberCount: { type: Number, default: 0 },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CRMStaff'
  }
}, { timestamps: true })

module.exports = mongoose.model('CRMSegment', crmSegmentSchema)
