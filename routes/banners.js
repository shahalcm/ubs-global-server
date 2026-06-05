const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const cache = require('../utils/cache');

router.get('/', async (req, res) => {
  try {
    const cachedBanners = await cache.get('banners:active');
    if (cachedBanners) {
      return res.json({ success: true, banners: cachedBanners });
    }
    const banners = await Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
    await cache.set('banners:active', banners, 3600); // cache for 1 hour
    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching banners' });
  }
});

module.exports = router;