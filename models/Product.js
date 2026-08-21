const mongoose = require('mongoose')

const productSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  sku: String,
  images: [String],
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  priceUSD: {
    type: Number,
    min: 0
  },
  comparePrice: Number,
  costPerItem: Number,
  stock: {
    type: Number,
    required: true,
    default: 0
  },
  stockUnit: {
    type: String,
    trim: true,
    default: 'pcs'
  },
  lowStockAlert: {
    type: Number,
    default: 10
  },
  weight: Number,
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  freeShipping: {
    type: Boolean,
    default: false
  },
  shippingFee: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive'],
    default: 'active'
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  tags: [String],
  brand: String,
  color: String,
  colors: [String],
  sizes: [String],
  countryOfOrigin: String,
  warranty: String,
  material: String,
  fit: String,
  sleeve: String,
  neck: String,
  refundPolicy: String,
  priceUnit: {
    type: String,
    trim: true,
    default: ''
  },
  specifications: [{
    key: String,
    value: String
  }],
  shortDescription: String,
  features: [String],
  benefits: [String],
  seoTitle: String,
  seoDescription: String,
  brandDescription: String,
  translations: {
    type: Map,
    of: {
      title: String,
      shortDescription: String,
      description: String,
      categoryName: String,
      subcategoryName: String,
      warranty: String,
      brand: String,
      brandDescription: String,
      features: [String],
      benefits: [String],
      tags: [String],
      seoTitle: String,
      seoDescription: String,
      specifications: [{ key: String, value: String }]
    },
    default: {}
  }
}, { timestamps: true })

productSchema.index({ title: 'text', description: 'text' })
productSchema.index({ category: 1 })
productSchema.index({ sellerId: 1 })
productSchema.index({ status: 1, approvalStatus: 1 })
productSchema.index({ isFeatured: 1 })
productSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Product', productSchema)