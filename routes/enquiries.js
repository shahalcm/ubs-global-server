const express = require('express')
const router = express.Router()
const enquiryController = require('../controllers/enquiryController')
const { protect } = require('../middleware/auth')
const { productUpload } = require('../config/cloudinary')

// Create enquiry
router.post('/', protect, enquiryController.createEnquiry)

// Get buyer's enquiries
router.get('/my', protect, enquiryController.getMyEnquiries)

// Single enquiry details
router.get('/:id', protect, enquiryController.getEnquiryById)

// Messages for enquiry
router.get('/:id/messages', protect, enquiryController.getEnquiryMessages)

// Send message
router.post('/:id/messages', protect, enquiryController.sendEnquiryMessage)

// Upload attachment
router.post('/:id/attachments', protect, productUpload.array('files', 5), (req, res) => {
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

// Respond to quotation (ACCEPT / REJECT)
router.post('/:id/quotation/respond', protect, enquiryController.respondToQuotation)

// Convert accepted quotation to order
router.post('/:id/convert-to-order', protect, enquiryController.convertToOrder)

module.exports = router
