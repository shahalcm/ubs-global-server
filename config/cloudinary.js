const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')
const fs = require('fs')
const path = require('path')

// Delete placeholder or malformed CLOUDINARY_URL from process.env to prevent Cloudinary Node SDK from using it and causing auth failures.
if (
  process.env.CLOUDINARY_URL &&
  (process.env.CLOUDINARY_URL.includes('<') ||
    process.env.CLOUDINARY_URL.includes('>') ||
    process.env.CLOUDINARY_URL.includes('your_api_key'))
) {
  delete process.env.CLOUDINARY_URL
}

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
let avatarStorage
let bannerStorage

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
        { width: 400, height: 400, crop: 'fill', quality: 'auto', fetch_format: 'auto' }
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

  avatarStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/avatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 300, height: 300, crop: 'fill', quality: 'auto', fetch_format: 'auto' }
      ],
      public_id: `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })
  })

  bannerStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/banners',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 1200, height: 600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
      ],
      public_id: `banner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

  avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/avatars')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, `avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
    }
  })

  bannerStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/banners')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, `banner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
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

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only images allowed'), false)
    }
  }
})

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only images allowed'), false)
    }
  }
})

let resumeStorage

if (isCloudinaryConfigured()) {
  resumeStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal/resumes',
      allowed_formats: ['pdf'],
      public_id: `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })
  })
} else {
  resumeStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads/resumes')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.pdf'
      cb(null, `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`)
    }
  })
}

const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF resumes allowed'), false)
    }
  }
})

module.exports = {
  cloudinary,
  productUpload,
  sellerUpload,
  categoryUpload,
  avatarUpload,
  bannerUpload,
  resumeUpload,
  isCloudinaryConfigured
}
