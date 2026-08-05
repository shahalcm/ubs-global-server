const Cart = require('../models/Cart')
const Product = require('../models/Product')

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({
      buyerId: req.user._id
    }).populate({
      path: 'items.productId',
      select: `title images price comparePrice
        stock freeShipping shippingFee`,
      populate: {
        path: 'sellerId',
        select: 'shopName shopLogo isVerified'
      }
    })

    if (!cart) {
      cart = await Cart.create({
        buyerId: req.user._id,
        items: []
      })
    }

    // Calculate totals
    let subtotal = 0
    let shippingTotal = 0
    let hasOutOfStockItems = false
    const validItems = []

    for (const item of cart.items) {
      if (!item.productId) continue
      const product = item.productId
      const isOutOfStock = product.stock === 0 || product.stock === undefined
      const stockLimitExceeded = product.stock < item.quantity

      if (isOutOfStock || stockLimitExceeded) {
        hasOutOfStockItems = true
      }

      const itemTotal = (product.price || 0) * item.quantity

      // Only include in subtotal if in stock
      if (!isOutOfStock) {
        subtotal += itemTotal
        if (!product.freeShipping) {
          shippingTotal += product.shippingFee || 0
        }
      }

      validItems.push({
        ...item.toObject(),
        itemTotal,
        isOutOfStock,
        stockLimitExceeded,
        availableStock: product.stock || 0
      })
    }

    const tax = subtotal * 0.05
    const grandTotal = subtotal + shippingTotal + tax

    res.json({
      success: true,
      cart: {
        items: validItems,
        subtotal: subtotal.toFixed(2),
        shippingTotal: shippingTotal.toFixed(2),
        tax: tax.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        itemCount: validItems.length,
        hasOutOfStockItems
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body

    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      })
    }

    if (product.stock === 0) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently Out of Stock',
        isOutOfStock: true
      })
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} units available in stock`
      })
    }

    let cart = await Cart.findOne({
      buyerId: req.user._id
    })

    if (!cart) {
      cart = new Cart({
        buyerId: req.user._id,
        items: []
      })
    }

    const existingIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    )

    if (existingIndex > -1) {
      const newQty = cart.items[existingIndex].quantity + quantity
      if (product.stock < newQty) {
        cart.items[existingIndex].quantity = product.stock
      } else {
        cart.items[existingIndex].quantity = newQty
      }
    } else {
      cart.items.push({
        productId,
        sellerId: product.sellerId,
        quantity,
        price: product.price
      })
    }

    await cart.save()

    res.json({
      success: true,
      message: 'Added to cart successfully 🛒',
      itemCount: cart.items.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body
    let cart = await Cart.findOne({ buyerId: req.user._id })
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' })

    const index = cart.items.findIndex(item => item.productId.toString() === productId)
    if (index > -1) {
      if (quantity <= 0) {
        cart.items.splice(index, 1)
      } else {
        cart.items[index].quantity = quantity
      }
      await cart.save()
    }
    res.json({ success: true, message: 'Cart updated successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.removeFromCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      buyerId: req.user._id
    })
    cart.items = cart.items.filter(
      item => item.productId.toString()
        !== req.params.productId
    )
    await cart.save()
    res.json({ success: true, message: 'Removed from cart' })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.clearCart = async (req, res) => {
  try {
    await Cart.findOneAndUpdate(
      { buyerId: req.user._id },
      { items: [] }
    )
    res.json({ success: true, message: 'Cart cleared' })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
