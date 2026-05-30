const express = require('express')
const router = express.Router()
const BotConfig = require('../models/BotConfig')
const { protect } = require('../middleware/auth')
const { sellerProtect } = require('../middleware/sellerAuth')

// Get bot config
router.get(
  '/',
  protect,
  sellerProtect,
  async (req, res) => {
    try {
      let config = await BotConfig.findOne({
        sellerId: req.seller._id
      })
      if (!config) {
        config = await BotConfig.create({
          sellerId: req.seller._id
        })
      }
      res.json({ success: true, config })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
)

// Update bot config
router.put(
  '/',
  protect,
  sellerProtect,
  async (req, res) => {
    try {
      const config = await BotConfig.findOneAndUpdate(
        { sellerId: req.seller._id },
        req.body,
        { new: true, upsert: true }
      )
      res.json({ success: true, config })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
)

// Toggle bot on/off
router.patch(
  '/toggle',
  protect,
  sellerProtect,
  async (req, res) => {
    try {
      let config = await BotConfig.findOne({
        sellerId: req.seller._id
      })
      if (!config) {
        config = await BotConfig.create({
          sellerId: req.seller._id
        })
      }
      config.isEnabled = !config.isEnabled
      await config.save()
      res.json({
        success: true,
        isEnabled: config.isEnabled
      })
    } catch (error) {
      res.status(500).json({ success: false, message: error.message })
    }
  }
)

module.exports = router
