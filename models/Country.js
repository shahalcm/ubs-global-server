const mongoose = require('mongoose')

const countrySchema = new mongoose.Schema({
  countryCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  countryName: {
    type: String,
    required: true,
    trim: true
  },
  regionCode: {
    type: String,
    required: true,
    enum: ['HIGH_COST', 'MIDDLE_COST', 'LOW_COST']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true })

countrySchema.index({ countryCode: 1 })
countrySchema.index({ regionCode: 1 })

module.exports = mongoose.model('Country', countrySchema)
