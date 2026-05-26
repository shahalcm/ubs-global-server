const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { sellerProtect } = require('../middleware/sellerAuth')
const { productUpload } = require('../config/cloudinary')
const {
  getProducts,
  getProduct,
  getProductsByCategory,
  searchProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getSellerPublicProducts
} = require('../controllers/productController')

// Seller routes
router.get(
  '/seller/my-products',
  protect,
  sellerProtect,
  getMyProducts
)

// Public routes (buyers)
router.get('/', getProducts)
router.get('/search', searchProducts)
router.get('/category/:categoryId', getProductsByCategory)
router.get('/seller/:sellerId', getSellerPublicProducts)
router.get('/:id', getProduct)

router.post(
  '/',
  protect,
  sellerProtect,
  productUpload.array('images', 5),
  addProduct
)
router.put(
  '/:id',
  protect,
  sellerProtect,
  productUpload.array('images', 5),
  updateProduct
)
router.delete('/:id', protect, sellerProtect, deleteProduct)

module.exports = router