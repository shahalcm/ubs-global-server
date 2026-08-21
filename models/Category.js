const mongoose = require('mongoose')
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  image: String,
  icon: String,
  description: String,
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  sortOrder: { type: Number, default: 0 },
  subcategories: [{
    name: String,
    slug: String,
    translations: {
      type: Map,
      of: String,
      default: {}
    }
  }],
  translations: {
    type: Map,
    of: {
      name: String,
      description: String
    },
    default: {}
  }
}, { timestamps: true })
module.exports = mongoose.model('Category', categorySchema)