const express = require('express')
const router = express.Router()
const contactRequestController = require('../controllers/contactRequestController')
const { protect } = require('../middleware/auth')

router.post('/', protect, contactRequestController.createRequest)
router.get('/my-requests', protect, contactRequestController.getMyRequests)
router.get('/:id', protect, contactRequestController.getRequestById)

module.exports = router
