const mongoose = require('mongoose')
const bannerSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  buttonText: String,
  description: String,
  image: String,
  imageByLang: {
    type: Map,
    of: String,
    default: {}
  },
  linkUrl: String,
  position: {
    type: String,
    enum: ['top', 'middle', 'bottom', 'realestate'],
    default: 'top'
  },
  isActive: { type: Boolean, default: true },
  startDate: Date,
  endDate: Date,
  sortOrder: { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },
  translations: {
    type: Map,
    of: {
      title: String,
      subtitle: String,
      buttonText: String,
      description: String
    },
    default: {}
  }
}, { timestamps: true })
module.exports = mongoose.model('Banner', bannerSchema)