const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')
const fs = require('fs')
const path = require('path')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

let storage;

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name') {
  storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: 'ubsglobal',
      allowed_formats: ['jpg','jpeg','png','webp'],
      transformation: [{ width: 800, quality: 'auto' }]
    })
  })
} else {
  // Fallback to local storage
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = path.join(__dirname, '../uploads')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      cb(null, dir)
    },
    filename: function (req, file, cb) {
      const ext = file.originalname ? path.extname(file.originalname) : '.jpg'
      cb(null, file.fieldname + '-' + Date.now() + ext)
    }
  })
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
})

module.exports = { upload, cloudinary }