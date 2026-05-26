const mongoose = require('mongoose')

const propertySchema = new mongoose.Schema({

  // Owner info
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ownerName: String,
  ownerPhone: String,
  ownerEmail: String,
  ownerAvatar: String,

  // Property details
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  propertyType: {
    type: String,
    enum: [
      'apartment',
      'house',
      'villa',
      'plot',
      'commercial',
      'office',
      'shop',
      'warehouse',
      'farm',
      'other'
    ],
    required: true
  },
  listingType: {
    type: String,
    enum: ['sale', 'rent', 'lease'],
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  priceUnit: {
    type: String,
    enum: ['total', 'per_month', 'per_year'],
    default: 'total'
  },
  currency: {
    type: String,
    default: 'USD'
  },
  isNegotiable: {
    type: Boolean,
    default: false
  },

  // Property specs
  bedrooms: Number,
  bathrooms: Number,
  area: Number,
  areaUnit: {
    type: String,
    enum: ['sqft', 'sqm', 'marla', 'kanal', 'acre'],
    default: 'sqft'
  },
  floor: Number,
  totalFloors: Number,
  facing: {
    type: String,
    enum: [
      'north', 'south', 'east', 'west',
      'northeast', 'northwest',
      'southeast', 'southwest'
    ]
  },
  furnishing: {
    type: String,
    enum: ['furnished', 'semi-furnished', 'unfurnished']
  },
  parking: {
    type: Boolean,
    default: false
  },
  parkingSpots: Number,

  // Location
  address: {
    street: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: String,
    landmark: String,
    fullAddress: String
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  mapLink: String,

  // Amenities
  amenities: [{
    type: String,
    enum: [
      'swimming_pool',
      'gym',
      'security',
      'elevator',
      'generator',
      'water_supply',
      'gas',
      'internet',
      'air_conditioning',
      'garden',
      'balcony',
      'terrace',
      'servant_room',
      'store_room',
      'club_house',
      'playground',
      'mosque',
      'school_nearby',
      'hospital_nearby',
      'market_nearby'
    ]
  }],

  // Media
  images: [String],
  videos: [String],

  // Status
  status: {
    type: String,
    enum: ['pending', 'active', 'sold', 'rented', 'inactive'],
    default: 'pending'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },

  // Payment
  platformFeePaid: {
    type: Boolean,
    default: false
  },
  platformFee: {
    type: Number,
    default: 0.52
  },
  platformFeePaymentId: String,
  platformFeePaidAt: Date,

  // Stats
  views: {
    type: Number,
    default: 0
  },
  inquiries: {
    type: Number,
    default: 0
  },
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Age of property
  yearBuilt: Number,
  age: String,

  // Available from
  availableFrom: Date,

  // Chat room
  chatRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  }

}, {
  timestamps: true
})

propertySchema.index({ location: '2dsphere' })
propertySchema.index({
  title: 'text',
  description: 'text',
  'address.city': 'text',
  'address.fullAddress': 'text'
})

module.exports = mongoose.model('Property', propertySchema)
