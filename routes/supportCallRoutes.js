const express = require('express')
const router = express.Router()
const supportCallController = require('../controllers/supportCallController')
const { protect } = require('../middleware/auth')
const { adminProtect } = require('../middleware/adminAuth')

// Custom middleware to allow either User OR Admin token validation
const protectEither = async (req, res, next) => {
  if (req.headers.authorization) {
    // Attempt Admin token verification
    try {
      let isAdminSuccess = false
      await new Promise((resolve) => {
        adminProtect(req, res, (err) => {
          if (!err && req.admin) {
            isAdminSuccess = true
          }
          resolve()
        })
      })
      if (isAdminSuccess) return next()
    } catch (err) {
      // Admin verification failed, proceed to try user token
    }

    // Attempt User token verification
    try {
      let isUserSuccess = false
      await new Promise((resolve) => {
        protect(req, res, (err) => {
          if (!err && req.user) {
            isUserSuccess = true
          }
          resolve()
        })
      })
      if (isUserSuccess) return next()
    } catch (err) {
      // Both failed
    }
  }
  return res.status(401).json({ success: false, message: 'Authentication required' })
}

router.post('/', protect, supportCallController.initiateSupportCall)
router.post('/:callId/accept', adminProtect, supportCallController.acceptSupportCall)
router.post('/:callId/reject', adminProtect, supportCallController.rejectSupportCall)
router.post('/:callId/cancel', protect, supportCallController.cancelSupportCall)
router.post('/:callId/end', protectEither, supportCallController.endSupportCall)
router.get('/history', protectEither, supportCallController.getSupportCallHistory)

module.exports = router
