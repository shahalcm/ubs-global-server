const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const cache = require('../utils/cache');

router.get('/', async (req, res) => {
  try {
    const cachedCategories = await cache.get('categories:all');
    if (cachedCategories) {
      return res.json({ success: true, categories: cachedCategories });
    }
    const categories = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
    await cache.set('categories:all', categories, 3600); // cache for 1 hour
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;