const Wishlist = require('../models/Wishlist')

exports.getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({
      buyerId: req.user._id
    }).populate({
      path: 'products.productId',
      select: 'title images price rating stock',
      populate: {
        path: 'sellerId',
        select: 'shopName isVerified'
      }
    })

    if (!wishlist) {
      wishlist = { products: [] }
    }

    res.json({
      success: true,
      products: wishlist.products
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.params

    let wishlist = await Wishlist.findOne({
      buyerId: req.user._id
    })

    if (!wishlist) {
      wishlist = new Wishlist({
        buyerId: req.user._id,
        products: []
      })
    }

    const index = wishlist.products.findIndex(
      p => p.productId?.toString() === productId
    )

    let isWishlisted
    if (index > -1) {
      wishlist.products.splice(index, 1)
      isWishlisted = false
    } else {
      wishlist.products.push({ productId })
      isWishlisted = true
    }

    await wishlist.save()

    res.json({
      success: true,
      isWishlisted,
      message: isWishlisted
        ? 'Added to wishlist'
        : 'Removed from wishlist'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
