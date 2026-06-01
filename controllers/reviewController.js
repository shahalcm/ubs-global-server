const Review = require('../models/Review')
const Product = require('../models/Product')
const Seller = require('../models/Seller')
const mongoose = require('mongoose')

// Helper function to recalculate average ratings
const recalculateRatings = async (productId, sellerId) => {
  try {
    if (productId) {
      const productReviews = await Review.find({ productId, isApproved: true })
      const totalReviews = productReviews.length
      const rating = totalReviews > 0 
        ? Number((productReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
        : 0
      await Product.findByIdAndUpdate(productId, { rating, totalReviews })
    }
    if (sellerId) {
      const sellerReviews = await Review.find({ sellerId, isApproved: true })
      const totalReviews = sellerReviews.length
      const rating = totalReviews > 0 
        ? Number((sellerReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
        : 0
      await Seller.findByIdAndUpdate(sellerId, { rating, totalReviews })
    }
  } catch (error) {
    console.error('Error recalculating ratings:', error)
  }
}

// Add or update a review
exports.addReview = async (req, res) => {
  try {
    const { productId, rating, comment, title } = req.body
    const buyerId = req.user._id

    if (!productId || !rating) {
      return res.status(400).json({ success: false, message: 'Product ID and Rating are required' })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }

    const sellerId = product.sellerId

    let review = await Review.findOne({ productId, buyerId })

    if (review) {
      review.rating = Number(rating)
      review.comment = comment || ''
      review.title = title || ''
      await review.save()
    } else {
      review = await Review.create({
        productId,
        buyerId,
        sellerId,
        rating: Number(rating),
        comment: comment || '',
        title: title || '',
        isApproved: true
      })
    }

    // Recalculate ratings for both product and seller
    await recalculateRatings(productId, sellerId)

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get reviews for a single product
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params
    const reviews = await Review.find({ productId, isApproved: true })
      .populate('buyerId', 'name avatar')
      .sort({ createdAt: -1 })

    res.json({ success: true, reviews })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.recalculateRatings = recalculateRatings
