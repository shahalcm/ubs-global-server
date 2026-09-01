const express = require('express')
const router = express.Router()

router.use('/auth', require('./authRoutes'))
router.use('/dashboard', require('./dashboardRoutes'))
router.use('/customers', require('./customerRoutes'))
router.use('/sellers', require('./sellerRoutes'))
router.use('/leads', require('./leadRoutes'))
router.use('/followups', require('./followupRoutes'))
router.use('/tasks', require('./taskRoutes'))
router.use('/notes', require('./noteRoutes'))
router.use('/support', require('./supportRoutes'))
router.use('/conversations', require('./conversationRoutes'))
router.use('/calls', require('./callRoutes'))
router.use('/analytics', require('./analyticsRoutes'))
router.use('/team', require('./teamRoutes'))
router.use('/search', require('./searchRoutes'))

module.exports = router
