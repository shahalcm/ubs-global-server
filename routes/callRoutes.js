const express = require('express')
const router = express.Router()
const callController = require('../controllers/callController')
const { protect } = require('../middleware/auth')

router.post('/', protect, callController.initiateCall)
router.patch('/:callId', protect, callController.updateCallStatus)
router.get('/history', protect, callController.getCallHistory)

module.exports = router
