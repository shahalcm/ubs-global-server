const express = require('express')
const router = express.Router()
const adminController = require('../controllers/adminController')
const { adminProtect } = require('../middleware/adminAuth')
const { categoryUpload } = require('../config/cloudinary')

// Dashboard
router.get('/dashboard-stats', adminProtect, adminController.getDashboardStats)

// Sellers
router.get('/sellers', adminProtect, adminController.getSellers)
router.patch('/sellers/:id/approve', adminProtect, adminController.approveSeller)
router.patch('/sellers/:id/reject', adminProtect, adminController.rejectSeller)
router.patch('/sellers/:id/suspend', adminProtect, adminController.suspendSeller)

// Users
router.get('/users', adminProtect, adminController.getUsers)
router.patch('/users/:id/block', adminProtect, adminController.blockUser)
router.patch('/users/:id/unblock', adminProtect, adminController.unblockUser)

// Products
router.get('/products', adminProtect, adminController.getProducts)
router.patch('/products/:id/approve', adminProtect, adminController.approveProduct)
router.patch('/products/:id/reject', adminProtect, adminController.rejectProduct)
router.put('/products/:id', adminProtect, adminController.updateProduct)

// Orders
router.get('/orders', adminProtect, adminController.getOrders)

// Analytics
router.get('/analytics/revenue', adminProtect, adminController.getRevenueAnalytics)

// Contact requests
router.get('/contact-requests', adminProtect, adminController.getContactRequests)
router.patch('/contact-requests/:id/approve', adminProtect, adminController.approveContactRequest)
router.patch('/contact-requests/:id/reject', adminProtect, adminController.rejectContactRequest)

// Chat monitoring
router.get('/chat-rooms', adminProtect, adminController.getChatRooms)
router.get('/chat/:id/messages', adminProtect, adminController.getAdminChatMessages)
router.post('/chat/:id/messages', adminProtect, adminController.sendAdminMessage)

// Notifications
router.post('/notifications/send', adminProtect, adminController.sendNotification)

// Categories
router.get('/categories', adminProtect, adminController.getCategories)
router.post('/categories', adminProtect, categoryUpload.single('image'), adminController.createCategory)
router.put('/categories/:id', adminProtect, categoryUpload.single('image'), adminController.updateCategory)
router.delete('/categories/:id', adminProtect, adminController.deleteCategory)

// Banners
router.get('/banners', adminProtect, adminController.getBanners)
router.post('/banners', adminProtect, adminController.createBanner)

// Transactions
router.get('/transactions', adminProtect, adminController.getTransactions)

// System settings
router.get('/settings', adminProtect, adminController.getSettings)
router.put('/settings', adminProtect, adminController.updateSettings)

// Reviews
router.get('/reviews', adminProtect, adminController.getReviews)
router.patch('/reviews/:id/approve', adminProtect, adminController.approveReview)
router.delete('/reviews/:id', adminProtect, adminController.deleteReview)

module.exports = router