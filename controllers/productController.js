const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Category = require('../models/Category')
const mongoose = require('mongoose')
const SystemConfig = require('../models/SystemConfig')

const getFileUrl = (req, file) => {
  if (!file) return '';
  if (file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))) {
    return file.path;
  }
  const host = req.get('host');
  const protocol = req.protocol;
  const normalizedPath = file.path.replace(/\\/g, '/');
  if (normalizedPath.includes('/uploads/products/')) {
    return `${protocol}://${host}/uploads/products/${file.filename}`;
  } else if (normalizedPath.includes('/uploads/sellers/')) {
    return `${protocol}://${host}/uploads/sellers/${file.filename}`;
  } else {
    return `${protocol}://${host}/uploads/${file.filename}`;
  }
};

exports.addProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      sku,
      category,
      subcategory,
      price,
      comparePrice,
      costPerItem,
      stock,
      lowStockAlert,
      weight,
      length,
      width,
      height,
      freeShipping,
      shippingFee,
      tags
    } = req.body

    // Validate required fields
    if (!title || !description || !price || !stock) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, price and stock are required'
      })
    }

    // Get uploaded image URLs from Cloudinary
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image required'
      })
    }

    const images = req.files.map(file => getFileUrl(req, file))

    // Validate seller exists and is approved
    const seller = await Seller.findById(req.seller._id)
    if (!seller || seller.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account is not approved yet'
      })
    }

    let categoryId = category
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      const categoryDoc = await Category.findOne({
        $or: [
          { slug: category.toLowerCase() },
          { name: { $regex: new RegExp(`^${category}$`, 'i') } }
        ]
      })
      if (categoryDoc) {
        categoryId = categoryDoc._id
      } else {
        // Fallback: create category dynamically if it does not exist
        const newCat = await Category.create({
          name: category.charAt(0).toUpperCase() + category.slice(1),
          slug: category.toLowerCase(),
          isActive: true
        })
        categoryId = newCat._id
      }
    }

    // Determine category name
    let categoryName = ''
    if (mongoose.Types.ObjectId.isValid(categoryId)) {
      const catDoc = await Category.findById(categoryId)
      if (catDoc) {
        categoryName = catDoc.name
      }
    }

    // Check system config settings
    let config = await SystemConfig.findOne()
    if (!config) {
      config = { requireJobApproval: true, requireServiceApproval: true }
    }

    let approvalStatus = 'approved'
    const normalizedCatName = categoryName.toLowerCase().trim()
    if (normalizedCatName === 'job portal' && config.requireJobApproval) {
      approvalStatus = 'pending'
    } else if (normalizedCatName === 'service portal' && config.requireServiceApproval) {
      approvalStatus = 'pending'
    }

    const product = await Product.create({
      sellerId: req.seller._id,
      title: title.trim(),
      description: description.trim(),
      sku: sku || `UBS-${Date.now()}`,
      images,
      category: categoryId,
      subcategory,
      price: Number(price),
      comparePrice: comparePrice
        ? Number(comparePrice)
        : undefined,
      costPerItem: costPerItem
        ? Number(costPerItem)
        : undefined,
      stock: Number(stock),
      lowStockAlert: lowStockAlert
        ? Number(lowStockAlert)
        : 5,
      weight: weight ? Number(weight) : undefined,
      dimensions: {
        length: length ? Number(length) : undefined,
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined
      },
      freeShipping: freeShipping === 'true'
        || freeShipping === true,
      shippingFee: shippingFee
        ? Number(shippingFee)
        : 0,
      tags: tags ? JSON.parse(tags) : [],
      status: 'active',
      approvalStatus
    })

    // Populate for response
    const populatedProduct = await Product.findById(
      product._id
    )
      .populate('category', 'name')
      .populate('sellerId', 'shopName shopLogo')

    // Notify admin about new product
    if (global.io) {
      global.io.to('admin-room').emit('newProductPending', {
        productId: product._id,
        productName: title,
        sellerShop: seller.shopName,
        productImage: images[0]
      })
    }

    const message = approvalStatus === 'pending'
      ? 'Your listing has been submitted and is pending admin approval.'
      : 'Product created successfully and is now visible to buyers.'

    res.status(201).json({
      success: true,
      message,
      product: populatedProduct
    })
  } catch (error) {
    console.error('Add product error:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sort,
      minPrice,
      maxPrice,
      rating
    } = req.query

    // Only show approved active products to buyers
    let query = {
      approvalStatus: 'approved',
      status: 'active',
      stock: { $gt: 0 }
    }

    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        query.category = category
      } else {
        const categoryDoc = await Category.findOne({
          $or: [
            { slug: category.toLowerCase() },
            { name: { $regex: new RegExp(`^${category}$`, 'i') } }
          ]
        })
        if (categoryDoc) {
          query.category = categoryDoc._id
        } else {
          // If the category does not exist, return an empty array with success
          return res.json({
            success: true,
            products: [],
            pagination: {
              page: Number(page),
              pages: 0,
              total: 0,
              hasMore: false
            }
          })
        }
      }
    }
    if (minPrice || maxPrice) {
      query.price = {}
      if (minPrice) query.price.$gte = Number(minPrice)
      if (maxPrice) query.price.$lte = Number(maxPrice)
    }
    if (rating) query.rating = { $gte: Number(rating) }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }

    let sortQuery = { createdAt: -1 }
    if (sort === 'price_low') sortQuery = { price: 1 }
    else if (sort === 'price_high') sortQuery = { price: -1 }
    else if (sort === 'rating') sortQuery = { rating: -1 }
    else if (sort === 'popular') {
      sortQuery = { totalSales: -1 }
    }

    let isRelated = false
    let products = await Product.find(query)
      .populate('category', 'name slug image')
      .populate({
        path: 'sellerId',
        select: `shopName shopLogo rating totalReviews isVerified businessType`
      })
      .sort(sortQuery)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean()

    let total = await Product.countDocuments(query)

    if (search && products.length === 0) {
      isRelated = true
      
      // 1. Try finding by matching category name
      const categoryDoc = await Category.findOne({
        name: { $regex: search, $options: 'i' }
      })
      if (categoryDoc) {
        products = await Product.find({
          approvalStatus: 'approved',
          status: 'active',
          stock: { $gt: 0 },
          category: categoryDoc._id
        })
          .populate('category', 'name slug image')
          .populate({
            path: 'sellerId',
            select: `shopName shopLogo rating totalReviews isVerified businessType`
          })
          .sort(sortQuery)
          .limit(Number(limit))
          .lean()
        total = products.length
      }

      // 2. If still empty, return general active products
      if (products.length === 0) {
        products = await Product.find({
          approvalStatus: 'approved',
          status: 'active',
          stock: { $gt: 0 }
        })
          .populate('category', 'name slug image')
          .populate({
            path: 'sellerId',
            select: `shopName shopLogo rating totalReviews isVerified businessType`
          })
          .sort(sortQuery)
          .limit(Number(limit))
          .lean()
        total = products.length
      }
    }

    res.json({
      success: true,
      products,
      isRelated,
      pagination: {
        page: Number(page),
        pages: Math.ceil(total / Number(limit)) || 1,
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

exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate({
        path: 'sellerId',
        select: `shopName ownerName shopLogo rating totalReviews isVerified businessType address description memberSince responseRate totalSales totalRevenue`
      })

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      })
    }

    // Get more products from same seller
    const sellerProducts = await Product.find({
      sellerId: product.sellerId._id,
      _id: { $ne: product._id },
      approvalStatus: 'approved',
      status: 'active'
    })
      .limit(6)
      .select('title images price rating totalReviews')

    res.json({
      success: true,
      product,
      sellerProducts
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getMyProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      approvalStatus,
      search
    } = req.query

    let query = { sellerId: req.seller._id }
    if (status) query.status = status
    if (approvalStatus) {
      query.approvalStatus = approvalStatus
    }
    if (search) {
      query.title = { $regex: search, $options: 'i' }
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Product.countDocuments(query)
    const pendingCount = await Product.countDocuments({
      sellerId: req.seller._id,
      approvalStatus: 'pending'
    })
    const approvedCount = await Product.countDocuments({
      sellerId: req.seller._id,
      approvalStatus: 'approved'
    })

    res.json({
      success: true,
      products,
      counts: { pendingCount, approvedCount, total },
      pagination: {
        page: Number(page),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })
  } catch (error) {
    console.error('getMyProducts error:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Get seller public products (for buyers)
exports.getSellerPublicProducts = async (req, res) => {
  try {
    const products = await Product.find({
      sellerId: req.params.sellerId,
      approvalStatus: 'approved',
      status: 'active'
    })
      .populate('category', 'name')
      .sort({ createdAt: -1 })

    const seller = await Seller.findById(
      req.params.sellerId
    ).select(
      `shopName shopLogo rating totalReviews isVerified businessType description`
    )

    res.json({ success: true, products, seller })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' })
    }

    const product = await Product.findById(id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    // Check ownership
    if (product.sellerId.toString() !== req.seller._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized action' })
    }

    const {
      title,
      description,
      sku,
      category,
      subcategory,
      price,
      comparePrice,
      costPerItem,
      stock,
      lowStockAlert,
      weight,
      length,
      width,
      height,
      freeShipping,
      shippingFee,
      tags
    } = req.body

    // Update fields if provided
    if (title) product.title = title.trim()
    if (description) product.description = description.trim()
    if (sku) product.sku = sku
    if (price) product.price = Number(price)
    if (comparePrice !== undefined) product.comparePrice = Number(comparePrice)
    if (costPerItem !== undefined) product.costPerItem = Number(costPerItem)
    if (stock !== undefined) product.stock = Number(stock)
    if (lowStockAlert !== undefined) product.lowStockAlert = Number(lowStockAlert)
    if (weight !== undefined) product.weight = Number(weight)
    
    if (length !== undefined || width !== undefined || height !== undefined) {
      product.dimensions = {
        length: length !== undefined ? Number(length) : product.dimensions?.length,
        width: width !== undefined ? Number(width) : product.dimensions?.width,
        height: height !== undefined ? Number(height) : product.dimensions?.height
      }
    }

    if (freeShipping !== undefined) {
      product.freeShipping = freeShipping === 'true' || freeShipping === true
    }
    if (shippingFee !== undefined) product.shippingFee = Number(shippingFee)
    if (tags) product.tags = typeof tags === 'string' ? JSON.parse(tags) : tags
    if (subcategory) product.subcategory = subcategory

    // Handle uploaded images if any
    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files.map(file => getFileUrl(req, file))
      product.images = uploadedImages
    }

    // Resolve category if provided
    let categoryId = category
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        const categoryDoc = await Category.findOne({
          $or: [
            { slug: category.toLowerCase() },
            { name: { $regex: new RegExp(`^${category}$`, 'i') } }
          ]
        })
        if (categoryDoc) {
          categoryId = categoryDoc._id
        } else {
          const newCat = await Category.create({
            name: category.charAt(0).toUpperCase() + category.slice(1),
            slug: category.toLowerCase(),
            isActive: true
          })
          categoryId = newCat._id
        }
      }
      product.category = categoryId
    }

    // Check approval settings
    let categoryName = ''
    const currentCategoryId = product.category
    if (mongoose.Types.ObjectId.isValid(currentCategoryId)) {
      const catDoc = await Category.findById(currentCategoryId)
      if (catDoc) categoryName = catDoc.name
    }

    let config = await SystemConfig.findOne()
    if (!config) {
      config = { requireJobApproval: true, requireServiceApproval: true }
    }

    let approvalStatus = product.approvalStatus
    const normalizedCatName = categoryName.toLowerCase().trim()
    if (normalizedCatName === 'job portal' && config.requireJobApproval) {
      approvalStatus = 'pending'
    } else if (normalizedCatName === 'service portal' && config.requireServiceApproval) {
      approvalStatus = 'pending'
    } else {
      approvalStatus = 'approved'
    }

    product.approvalStatus = approvalStatus
    await product.save()

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('sellerId', 'shopName shopLogo')

    // Notify admin if pending approval
    if (approvalStatus === 'pending' && global.io) {
      global.io.to('admin-room').emit('newProductPending', {
        productId: product._id,
        productName: product.title,
        sellerShop: populatedProduct.sellerId?.shopName,
        productImage: product.images?.[0]
      })
    }

    const message = approvalStatus === 'pending'
      ? 'Product updated successfully and is pending admin approval.'
      : 'Product updated successfully.'

    res.json({
      success: true,
      message,
      product: populatedProduct
    })
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}
exports.deleteProduct = async (req, res) => {
  res.json({ success: true, message: 'Delete product not fully implemented here yet' });
}
exports.searchProducts = async (req, res) => {
  res.json({ success: true, products: [] });
}
exports.getProductsByCategory = async (req, res) => {
  res.json({ success: true, products: [] });
}

// Start direct chat with product seller
exports.startProductChat = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const ChatRoom = require('../models/ChatRoom')

    // Check if chat room already exists for this buyer and this product
    let chatRoom = await ChatRoom.findOne({
      productId: product._id,
      buyerId: req.user._id
    })

    if (!chatRoom) {
      chatRoom = await ChatRoom.create({
        buyerId: req.user._id,
        sellerId: product.sellerId,
        sellerModel: 'Seller',
        productId: product._id,
        roomName: `${req.user.name} about ${product.title}`,
        status: 'active',
        adminMonitoring: false, // Direct buyer-seller chat
        lastMessage: `Inquiry about ${product.title}`,
        lastMessageAt: new Date(),
        lastMessageBy: 'buyer'
      })
    }

    res.json({
      success: true,
      chatRoomId: chatRoom._id,
      message: 'Chat started successfully'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}