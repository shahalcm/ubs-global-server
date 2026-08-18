const express = require('express')
const router = express.Router()
const callController = require('../controllers/callController')
const { protect } = require('../middleware/auth')
const { adminProtect } = require('../middleware/adminAuth')

// Unified Auth Middleware (Allows User JWT or Admin JWT)
const optionalOrUserAuth = async (req, res, next) => {
  if (req.headers.authorization?.startsWith('Bearer')) {
    try {
      return await protect(req, res, () => next())
    } catch (err) {
      try {
        return await adminProtect(req, res, () => next())
      } catch (err2) {
        return next()
      }
    }
  }
  next()
}

router.post('/initiate', protect, callController.initiateCall)
router.post('/push-token', protect, callController.registerPushToken)
router.get('/history', protect, callController.getCallHistory)
router.get('/active', adminProtect, callController.getActiveCalls)
router.patch('/:callId', protect, callController.updateCallStatus)

module.exports = router
