const mongoose = require('mongoose')

const legalDocSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ['privacy-policy', 'terms-and-conditions', 'refund-policy', 'account-deletion-policy']
  },
  title: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  lastUpdatedBy: { 
    type: String // We can store admin name or admin email or ObjectId as string
  }
}, { timestamps: true })

module.exports = mongoose.model('LegalDoc', legalDocSchema)
