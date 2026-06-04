const mongoose = require('mongoose')

const gdprRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestType: {
    type: String,
    enum: ['delete-account', 'export-data', 'delete-data'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled'],
    default: 'pending'
  },
  adminNote: {
    type: String
  },
  completedAt: {
    type: Date
  }
}, { timestamps: true })

module.exports = mongoose.model('GDPRRequest', gdprRequestSchema)
