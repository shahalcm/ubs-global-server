const Seller = require('../models/Seller')

exports.sellerProtect = async (req, res, next) => {
  try {
    const seller = await Seller.findOne({
      userId: req.user._id,
      status: 'approved'
    })
    if (!seller) {
      return res.status(403).json({
        success: false,
        message: 'Seller account required'
      })
    }
    req.seller = seller
    next()
  } catch (error) {
    console.error('sellerProtect error:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}