const mongoose = require('mongoose')

const jobApplicationSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  experience: {
    type: String,
    required: true,
    trim: true
  },
  coverLetter: {
    type: String,
    default: '',
    trim: true
  },
  cvUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['applied', 'reviewed', 'rejected', 'accepted'],
    default: 'applied'
  }
}, { timestamps: true })

module.exports = mongoose.model('JobApplication', jobApplicationSchema)
