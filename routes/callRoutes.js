const express = require('express')
const router = express.Router()
const callController = require('../controllers/callController')
const { protect } = require('../middleware/auth')
const { adminProtect } = require('../middleware/adminAuth')

// Unified Auth Middleware allowing User OR Admin JWT tokens
const protectEither = async (req, res, next) => {
  if (req.headers.authorization) {
    // 1. Try Admin verification
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

    // 2. Try User verification
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
  }
  return res.status(401).json({ success: false, message: 'Authentication required' })
}

router.post('/initiate', protectEither, callController.initiateCall)
router.post('/push-token', protect, callController.registerPushToken)
router.get('/history', protectEither, callController.getCallHistory)
router.get('/active', adminProtect, callController.getActiveCalls)
router.patch('/:callId', protectEither, callController.updateCallStatus)

module.exports = router
