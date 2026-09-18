const express = require('express')
const router = express.Router()
const adminEnquiryController = require('../controllers/adminEnquiryController')
const { adminProtect } = require('../middleware/adminAuth')
const { enquiryUpload } = require('../config/cloudinary')

// Admin stats
router.get('/stats', adminProtect, adminEnquiryController.getDashboardStats)

// List enquiries
router.get('/', adminProtect, adminEnquiryController.getEnquiries)

// Single enquiry details
router.get('/:id', adminProtect, adminEnquiryController.getEnquiryById)

// Messages for enquiry
router.get('/:id/messages', adminProtect, adminEnquiryController.getEnquiryMessages)

// Send message
router.post('/:id/messages', adminProtect, adminEnquiryController.sendEnquiryMessage)

// Admin upload single attachment
router.post('/upload', adminProtect, (req, res) => {
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

      res.json({ success: true, url, attachment })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  })
})

// Upload attachment in chat
router.post('/:id/attachments', adminProtect, (req, res) => {
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

// Update status
router.patch('/:id/status', adminProtect, adminEnquiryController.updateStatus)

// Assign admin
router.patch('/:id/assign', adminProtect, adminEnquiryController.assignAdmin)

// Send quotation
router.post('/:id/quotation', adminProtect, adminEnquiryController.sendQuotation)

// Close enquiry
router.post('/:id/close', adminProtect, adminEnquiryController.closeEnquiry)

module.exports = router
