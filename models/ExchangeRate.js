const mongoose = require('mongoose')

const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  rates: {
    type: Map,
    of: Number,
    required: true
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true })

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema)
