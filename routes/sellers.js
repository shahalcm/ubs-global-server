const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.get('/registration-fee', sellerController.getRegistrationFee);
router.post('/create-subscription-order', protect, sellerController.createSubscriptionOrder);

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

// Pickup Addresses
router.get('/pickup-addresses', protect, sellerController.getPickupAddresses);
router.post('/pickup-addresses', protect, sellerController.addPickupAddress);
router.patch('/pickup-addresses/:pickupLocationId/default', protect, sellerController.setDefaultPickupAddress);

module.exports = router;