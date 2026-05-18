const Product = require('../models/Product')
const Seller = require('../models/Seller')
const Category = require('../models/Category')

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

    const images = req.files.map(file => file.path)
    // file.path contains the full Cloudinary URL

    // Validate seller exists and is approved
    const seller = await Seller.findById(req.seller._id)
    if (!seller || seller.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account is not approved yet'
      })
    }

    const product = await Product.create({
      sellerId: req.seller._id,
      title: title.trim(),
      description: description.trim(),
      sku: sku || `UBS-${Date.now()}`,
      images,
      category,
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
      approvalStatus: 'pending'
    })

    // Populate for response
    const populatedProduct = await Product.findById(
      product._id
    )
      .populate('category', 'name')
      .populate('sellerId', 'shopName shopLogo')

    // Notify admin about new pending product
    if (global.io) {
      global.io.to('admin-room').emit('newProductPending', {
        productId: product._id,
        productName: title,
        sellerShop: seller.shopName,
        productImage: images[0]
      })
    }

    res.status(201).json({
      success: true,
      message: 'Product submitted for admin approval. It will be visible to buyers once approved.',
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

    if (category) query.category = category
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

    const products = await Product.find(query)
      .populate('category', 'name slug image')
      .populate({
        path: 'sellerId',
        select: `shopName shopLogo rating totalReviews isVerified businessType`
      })
      .sort(sortQuery)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean()

    const total = await Product.countDocuments(query)

    res.json({
      success: true,
      products,
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
  res.json({ success: true, message: 'Update product not fully implemented here yet' });
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