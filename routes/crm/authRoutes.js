const express = require('express')
const router = express.Router()
const { login, getMe, forgotPassword, resetPassword } = require('../../controllers/crm/crmAuthController')
const { protectCRM } = require('../../middleware/crmAuthMiddleware')

router.post('/login', login)
router.get('/me', protectCRM, getMe)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

module.exports = router
