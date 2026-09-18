const express = require('express')
const router = express.Router()
const enquiryController = require('../controllers/enquiryController')
const { protect } = require('../middleware/auth')
const { enquiryUpload } = require('../config/cloudinary')

// Create enquiry
router.post('/', protect, enquiryController.createEnquiry)

// Get buyer's enquiries
router.get('/my', protect, enquiryController.getMyEnquiries)

// Upload single attachment (before or during enquiry creation)
router.post('/upload', protect, (req, res) => {
  enquiryUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message })
    }
    try {
      const file = req.file
      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' })
      }
      const host = req.get('host') || 'api.ubsglobalapp.com'
      const protocol = req.protocol || 'https'
      const url = file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))
        ? file.path
        : `${protocol}://${host}/uploads/enquiries/${file.filename}`

      const attachment = {
        url,
        name: file.originalname || 'attachment',
        fileType: file.mimetype || 'image/jpeg',
        size: file.size || 0
      }

      res.json({
        success: true,
        url,
        attachment
      })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  })
})

// Single enquiry details
router.get('/:id', protect, enquiryController.getEnquiryById)

// Messages for enquiry
router.get('/:id/messages', protect, enquiryController.getEnquiryMessages)

// Send message
router.post('/:id/messages', protect, enquiryController.sendEnquiryMessage)

// Upload attachments for existing enquiry chat
router.post('/:id/attachments', protect, (req, res) => {
  enquiryUpload.array('files', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message })
    }
    try {
      const files = req.files || (req.file ? [req.file] : [])
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'No files provided' })
      }
      const host = req.get('host') || 'api.ubsglobalapp.com'
      const protocol = req.protocol || 'https'
      const attachments = files.map(f => {
        const url = f.path && (f.path.startsWith('http://') || f.path.startsWith('https://'))
          ? f.path
          : `${protocol}://${host}/uploads/enquiries/${f.filename}`
        return {
          url,
          name: f.originalname || 'attachment',
          fileType: f.mimetype,
          size: f.size
        }
      })
      res.json({ success: true, attachments })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  })
})

// Respond to quotation (ACCEPT / REJECT)
router.post('/:id/quotation/respond', protect, enquiryController.respondToQuotation)

// Convert accepted quotation to order
router.post('/:id/convert-to-order', protect, enquiryController.convertToOrder)

module.exports = router
