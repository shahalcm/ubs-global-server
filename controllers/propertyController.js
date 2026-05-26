const Property = require('../models/Property')
const User = require('../models/User')
const ChatRoom = require('../models/ChatRoom')
const Razorpay = require('razorpay')
const crypto = require('crypto')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret'
})

const PLATFORM_FEE = 0.52

// Helper for formatting local/remote file URLs
const getFileUrl = (req, file) => {
  if (!file) return '';
  if (file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))) {
    return file.path;
  }
  const host = req.get('host');
  const protocol = req.protocol;
  const normalizedPath = file.path.replace(/\\/g, '/');
  return `${protocol}://${host}/uploads/products/${file.filename}`;
};

// Get all active properties with filters and sorting
exports.getProperties = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      propertyType,
      listingType,
      city,
      minPrice,
      maxPrice,
      bedrooms,
      sort = 'newest'
    } = req.query

    let query = {
      status: 'active',
      platformFeePaid: true
    }

    if (propertyType) query.propertyType = propertyType
    if (listingType) query.listingType = listingType
    if (city) {
      query['address.city'] = {
        $regex: city,
        $options: 'i'
      }
    }
    if (bedrooms) query.bedrooms = Number(bedrooms)
    if (minPrice || maxPrice) {
      query.price = {}
      if (minPrice) query.price.$gte = Number(minPrice)
      if (maxPrice) query.price.$lte = Number(maxPrice)
    }

    let sortQuery = { createdAt: -1 }
    if (sort === 'price_low') sortQuery = { price: 1 }
    if (sort === 'price_high') sortQuery = { price: -1 }
    if (sort === 'popular') sortQuery = { views: -1 }

    const properties = await Property.find(query)
      .populate('ownerId', 'name avatar phone email')
      .sort(sortQuery)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean()

    const total = await Property.countDocuments(query)

    res.json({
      success: true,
      properties,
      pagination: {
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
        total,
        hasMore: Number(page) * Number(limit) < total
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Search properties ONLY. Empty or short queries are rejected to return 404 block on client
exports.searchProperties = async (req, res) => {
  try {
    const { q } = req.query

    if (!q || q.trim().length < 2) {
      return res.status(404).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      })
    }

    // Search ONLY in properties
    const properties = await Property.find({
      status: 'active',
      platformFeePaid: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { 'address.city': { $regex: q, $options: 'i' } },
        { 'address.fullAddress': { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { propertyType: { $regex: q, $options: 'i' } }
      ]
    })
      .populate('ownerId', 'name avatar')
      .limit(20)
      .lean()

    if (properties.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No properties found matching search query.'
      })
    }

    res.json({
      success: true,
      properties,
      count: properties.length,
      query: q
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Get single property
exports.getProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('ownerId', 'name avatar phone email createdAt')

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      })
    }

    res.json({ success: true, property })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Create Razorpay order for $0.52 fee (52 cents)
exports.createPropertyOrder = async (req, res) => {
  try {
    const amountInCents = 52

    let razorpayOrder
    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID === 'rzp_test_your_key_id') {
      razorpayOrder = { id: `order_mock_${Date.now()}` }
    } else {
      razorpayOrder = await razorpay.orders.create({
        amount: amountInCents,
        currency: 'USD',
        receipt: `property_fee_${Date.now()}`,
        notes: {
          userId: req.user._id.toString(),
          type: 'property_platform_fee'
        }
      })
    }

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInCents,
      currency: 'USD',
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
      platformFee: PLATFORM_FEE,
      prefill: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Verify fee payment and post property
exports.verifyPropertyFee = async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      propertyData,
      images
    } = req.body

    // Verify signature
    if (razorpayOrderId && razorpayOrderId.startsWith('order_mock_')) {
      // Bypass signature verification for mock/development orders
    } else {
      const body = razorpayOrderId + '|' + razorpayPaymentId
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret')
        .update(body.toString())
        .digest('hex')

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        })
      }
    }

    const user = await User.findById(req.user._id)

    // Now post the property
    const property = await Property.create({
      ownerId: req.user._id,
      ownerName: user.name,
      ownerPhone: user.phone,
      ownerEmail: user.email,
      ownerAvatar: user.avatar,
      ...propertyData,
      images: images || [],
      status: 'active',
      platformFeePaid: true,
      platformFee: PLATFORM_FEE,
      platformFeePaymentId: razorpayPaymentId,
      platformFeePaidAt: new Date()
    })

    // Notify admin
    if (global.io) {
      global.io.to('admin-room').emit('newPropertyListed', {
        propertyId: property._id,
        title: property.title,
        ownerName: user.name,
        city: property.address?.city
      })
    }

    res.json({
      success: true,
      message: 'Property listed successfully!',
      property
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Upload Property Images route to get URLs prior to verification
exports.uploadPropertyImages = async (req, res) => {
  try {
    const images = req.files ? req.files.map(file => getFileUrl(req, file)) : []
    res.json({
      success: true,
      images
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Post property directly (with images in req.files if sent as Multipart Form)
exports.postProperty = async (req, res) => {
  try {
    const images = req.files
      ? req.files.map(f => getFileUrl(req, f))
      : []

    const propertyDataString = req.body.propertyData
    const propertyData = propertyDataString
      ? JSON.parse(propertyDataString)
      : req.body

    const razorpayPaymentId = req.body.razorpayPaymentId

    if (!razorpayPaymentId) {
      return res.status(400).json({
        success: false,
        message: 'Platform fee payment required'
      })
    }

    const user = await User.findById(req.user._id)

    const property = await Property.create({
      ownerId: req.user._id,
      ownerName: user.name,
      ownerPhone: user.phone,
      ownerEmail: user.email,
      ownerAvatar: user.avatar,
      ...propertyData,
      images,
      status: 'active',
      platformFeePaid: true,
      platformFee: PLATFORM_FEE,
      platformFeePaymentId: razorpayPaymentId,
      platformFeePaidAt: new Date()
    })

    res.status(201).json({
      success: true,
      message: 'Property listed successfully!',
      property
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Start chat with property owner
exports.startPropertyChat = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      })
    }

    // Check if chat room already exists
    let chatRoom = await ChatRoom.findOne({
      'meta.propertyId': property._id,
      buyerId: req.user._id
    })

    if (!chatRoom) {
      chatRoom = await ChatRoom.create({
        buyerId: req.user._id,
        sellerId: property.ownerId,
        sellerModel: 'User', // Peer-to-peer User referenced dynamically
        roomName: `${req.user.name} about ${property.title}`,
        status: 'active',
        adminMonitoring: false,
        meta: {
          propertyId: property._id,
          propertyTitle: property.title,
          propertyImage: property.images?.[0] || 'https://via.placeholder.com/400x250',
          type: 'property_inquiry'
        }
      })

      property.inquiries += 1
      await property.save()
    }

    // Notify property owner
    if (global.io) {
      global.io.to(property.ownerId.toString()).emit('newPropertyInquiry', {
        chatRoomId: chatRoom._id,
        buyerName: req.user.name,
        propertyTitle: property.title
      })
    }

    res.json({
      success: true,
      chatRoomId: chatRoom._id,
      message: 'Chat started'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Increment views count
exports.incrementViews = async (req, res) => {
  try {
    await Property.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } }
    )
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Save or unsave property
exports.saveProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }
    const userId = req.user._id

    const index = property.savedBy.indexOf(userId)
    if (index > -1) {
      property.savedBy.splice(index, 1)
    } else {
      property.savedBy.push(userId)
    }

    await property.save()

    res.json({
      success: true,
      isSaved: index === -1
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Get user's properties (owned by current authenticated user)
exports.getUserProperties = async (req, res) => {
  try {
    const properties = await Property.find({
      ownerId: req.user._id
    }).sort({ createdAt: -1 })

    res.json({ success: true, properties })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Delete property listing
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }
    if (property.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: not listing owner' })
    }

    await Property.findByIdAndDelete(req.params.id)
    res.json({ success: true, message: 'Property deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update property details or status
exports.updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' })
    }
    if (property.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied: not listing owner' })
    }

    const updates = req.body
    
    if (updates.status && !['pending', 'active', 'sold', 'rented', 'inactive'].includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' })
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )

    res.json({ success: true, message: 'Property updated successfully', property: updatedProperty })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
