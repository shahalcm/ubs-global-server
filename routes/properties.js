const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { productUpload } = require('../config/cloudinary')
const {
  getProperties,
  getProperty,
  searchProperties,
  postProperty,
  createPropertyOrder,
  verifyPropertyFee,
  uploadPropertyImages,
  getUserProperties,
  deleteProperty,
  saveProperty,
  incrementViews,
  startPropertyChat,
  updateProperty
} = require('../controllers/propertyController')

// Public routes
router.get('/', getProperties)
router.get('/search', searchProperties)
router.get('/:id', getProperty)
router.patch('/:id/views', incrementViews)

// Protected routes
router.get(
  '/user/my-properties',
  protect,
  getUserProperties
)
router.post(
  '/',
  protect,
  productUpload.array('images', 10),
  postProperty
)
router.post(
  '/upload-images',
  protect,
  productUpload.array('images', 10),
  uploadPropertyImages
)
router.post(
  '/create-fee-order',
  protect,
  createPropertyOrder
)
router.post(
  '/verify-fee',
  protect,
  verifyPropertyFee
)
router.delete('/:id', protect, deleteProperty)
router.post('/:id/save', protect, saveProperty)
router.put('/:id', protect, updateProperty)
router.post(
  '/:id/chat',
  protect,
  startPropertyChat
)

module.exports = router
