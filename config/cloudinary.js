const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')

cloudinary.config({
  cloud_name: 'dtubrloue',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const productStorage = new CloudinaryStorage({
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

const sellerStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'ubsglobal/sellers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill' }
    ]
  })
})

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

module.exports = {
  cloudinary,
  productUpload,
  sellerUpload
}
