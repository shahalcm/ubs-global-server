const mongoose = require('mongoose')

const systemConfigSchema = new mongoose.Schema({
  requireJobApproval: {
    type: Boolean,
    default: true
  },
  requireServiceApproval: {
    type: Boolean,
    default: true
  }
}, { timestamps: true })

module.exports = mongoose.model('SystemConfig', systemConfigSchema)
