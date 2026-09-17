const express = require('express')
const router = express.Router()
const adminEnquiryController = require('../controllers/adminEnquiryController')
const { adminProtect } = require('../middleware/adminAuth')
const { productUpload } = require('../config/cloudinary')

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

// Upload attachment
router.post('/:id/attachments', adminProtect, productUpload.array('files', 5), (req, res) => {
  try {
    const files = req.files || []
    const attachments = files.map(f => ({
      url: f.path || `/uploads/${f.filename}`,
      name: f.originalname,
      fileType: f.mimetype,
      size: f.size
    }))
    res.json({ success: true, attachments })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
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
