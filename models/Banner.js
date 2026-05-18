const mongoose = require('mongoose')
const bannerSchema = new mongoose.Schema({
  title: String,
  image: String,
  linkUrl: String,
  position: {
    type: String,
    enum: ['top','middle','bottom'],
    default: 'top'
  },
  isActive: { type: Boolean, default: true },
  startDate: Date,
  endDate: Date,
  sortOrder: { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },
}, { timestamps: true })
module.exports = mongoose.model('Banner', bannerSchema)