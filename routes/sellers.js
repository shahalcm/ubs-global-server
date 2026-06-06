const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.post('/apply', protect, upload.fields([
  { name: 'shopLogo', maxCount: 1 },
  { name: 'idProof', maxCount: 1 }
]), sellerController.applyAsSeller);

// Profile
router.get('/profile', protect, sellerController.getSellerProfile);
router.put('/profile', protect, sellerController.updateSellerProfile);

// Dashboard stats
router.get('/dashboard-stats', protect, sellerController.getDashboardStats);

// Earnings analytics
router.get('/earnings', protect, sellerController.getEarnings);

// Recent orders
router.get('/recent-orders', protect, sellerController.getRecentOrders);

module.exports = router;