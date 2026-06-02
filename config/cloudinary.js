const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')
const fs = require('fs')
const path = require('path')

const isCloudinaryConfigured = () => {
  const url = process.env.CLOUDINARY_URL
  if (url && url.startsWith('cloudinary://')) {
    if (
      !url.includes('<your_api_key>') &&
      !url.includes('your_api_key') &&
      !url.includes('<your_api_secret>') &&
      !url.includes('your_api_secret')
    ) {
      return true
    }
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (
    cloudName &&
    cloudName !== 'your_cloud_name' &&
    apiKey &&
    apiKey !== 'your_cloudinary_api_key' &&
    !apiKey.includes('<your_') &&
    apiSecret &&
    apiSecret !== 'your_cloudinary_api_secret' &&
    !apiSecret.includes('<your_')
  ) {
    return true
  }

  return false
}

let productStorage
let sellerStorage
let categoryStorage

if (isCloudinaryConfigured()) {
  const url = process.env.CLOUDINARY_URL
  const hasValidUrl = url && url.startsWith('cloudinary://') && 
                      !url.includes('<your_') && 
                      !url.includes('your_api_key')

  if (!hasValidUrl) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dtubrloue',
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    })
  } else {
    // If CLOUDINARY_URL is set and valid, cloudinary automatically configures itself, but we can call config() to ensure setup
    cloudinary.config()
  }

  productStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/products',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        {
          width: 1000,
          height: 1000,
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto'
        }
      ],
      public_id: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })
  })

  sellerStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/sellers',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 400, height: 400, crop: 'fill' }
      ]
    })
  })

  categoryStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/categories',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 600, height: 600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
      ],
      public_id: `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })
  })
} else {
  // Fallback to local storage
  productStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/products')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
    }
  })

  sellerStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/sellers')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, `seller_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
    }
  })

  categoryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/categories')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
    }
  })
}

const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only images allowed'), false)
    }
  }
})

const sellerUpload = multer({
  storage: sellerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
})

const categoryUpload = multer({
  storage: categoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only images allowed'), false)
    }
  }
})

module.exports = {
  cloudinary,
  productUpload,
  sellerUpload,
  categoryUpload,
  isCloudinaryConfigured
}
