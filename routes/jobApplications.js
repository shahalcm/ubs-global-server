const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const { applyForJob } = require('../controllers/jobApplicationController')
const { resumeUpload } = require('../config/cloudinary')

router.post('/apply', protect, resumeUpload.single('resume'), applyForJob)

module.exports = router
