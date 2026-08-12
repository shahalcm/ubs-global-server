const SellerRegistrationOffer = require('../models/SellerRegistrationOffer')
const RegionalPricingRule = require('../models/RegionalPricingRule')
const PromoCode = require('../models/PromoCode')
const Country = require('../models/Country')
const Seller = require('../models/Seller')
const User = require('../models/User')
const geoService = require('../services/geoService')
const currencyService = require('../services/currencyService')
const Razorpay = require('razorpay')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder'
})

/**
 * GET /api/seller-registration/offer
 * Determine the seller's eligible regional registration offer.
 */
exports.getRegistrationOffer = async (req, res) => {
  try {
    const userId = req.user._id

    // 1. Check if user is already a paid seller
    const existingSeller = await Seller.findOne({ userId })
    if (existingSeller && existingSeller.registrationFeePaid) {
      return res.status(400).json({
        success: false,
        message: 'You have already paid the seller registration fee and submitted your application.'
      })
    }

    // 2. Check for an active, unexpired pending offer for this user
    let offer = await SellerRegistrationOffer.findOne({
      userId,
      status: 'PENDING',
      expiresAt: { $gt: new Date() }
    })

    if (offer) {
      // Find active promo associated with the region to return transparency details
      const activePromo = await PromoCode.findOne({ regionCode: offer.regionCode, isActive: true })
      return res.json({
        success: true,
        country: offer.countryCode,
        region: offer.regionCode,
        baseAmount: offer.baseAmount,
        currency: offer.currency,
        discount: {
          type: offer.discountType,
          value: offer.discountValue,
          amount: offer.discountAmount
        },
        finalAmount: offer.finalAmount,
        promo: {
          available: !!activePromo,
          code: offer.promoCode || (activePromo ? activePromo.code : null)
        },
        offerId: offer._id
      })
    }

    // 3. Determine country code
    let countryCode = req.user.countryCode || ''
    if (!countryCode) {
      const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
      const geoInfo = await geoService.detectLocationFromIP(clientIP)
      countryCode = geoInfo.countryCode || 'US'
    }
    countryCode = countryCode.toUpperCase()

    // 4. Map country to pricing region
    let regionCode = 'HIGH_COST'
    const countryMapping = await Country.findOne({ countryCode, isActive: true })
    if (countryMapping) {
      regionCode = countryMapping.regionCode
    } else {
      // Fallback: search in RegionalPricingRules countries array
      const pricingRuleOverride = await RegionalPricingRule.findOne({ countries: countryCode, isActive: true })
      if (pricingRuleOverride) {
        regionCode = pricingRuleOverride.regionCode
      }
    }

    // 5. Find active regional pricing rule
    const rule = await RegionalPricingRule.findOne({ regionCode, isActive: true })
    const baseAmount = rule ? rule.baseAmount : 200
    const discountType = rule ? rule.discountType : 'percentage'
    const discountValue = rule ? rule.discountValue : 0

    const discountAmount = discountType === 'percentage' 
      ? Number(((baseAmount * discountValue) / 100).toFixed(2))
      : discountValue
    const finalAmount = Math.max(0, Number((baseAmount - discountAmount).toFixed(2)))

    // 6. Find if there is an active regional promo code configured
    const activePromo = await PromoCode.findOne({ regionCode, isActive: true })

    // 7. Create a new temporary registration offer (lasts 30 minutes)
    offer = new SellerRegistrationOffer({
      userId,
      countryCode,
      regionCode,
      baseAmount,
      discountType,
      discountValue,
      discountAmount,
      finalAmount,
      currency: 'USD',
      promoCode: activePromo ? activePromo.code : undefined,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 mins expiry
    })

    await offer.save()

    res.json({
      success: true,
      country: countryCode,
      region: regionCode,
      baseAmount,
      currency: 'USD',
      discount: {
        type: discountType,
        value: discountValue,
        amount: discountAmount
      },
      finalAmount,
      promo: {
        available: !!activePromo,
        code: activePromo ? activePromo.code : null
      },
      offerId: offer._id
    })
  } catch (error) {
    console.error('Error loading regional registration offer:', error)
    res.status(500).json({ success: false, message: 'Regional offer could not be loaded.' })
  }
}

/**
 * POST /api/seller-registration/promo/validate
 * Validate promo code against active region configurations and apply to offer.
 */
exports.validatePromoCode = async (req, res) => {
  try {
    const { offerId, code } = req.body

    if (!offerId || !code) {
      return res.status(400).json({ success: false, message: 'Offer ID and promo code are required.' })
    }

    // 1. Fetch the legitimate offer
    const offer = await SellerRegistrationOffer.findOne({ _id: offerId, userId: req.user._id })
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Registration offer not found.' })
    }

    if (offer.status !== 'PENDING' || offer.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Your seller registration offer has expired. Please refresh.' })
    }

    // 2. Fetch the promo code
    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), isActive: true })
    if (!promo) {
      return res.status(400).json({ success: false, message: 'This promotion is no longer available.' })
    }

    // 3. Verify dates
    const now = new Date()
    if (promo.startsAt && promo.startsAt > now) {
      return res.status(400).json({ success: false, message: 'This promotion has not started yet.' })
    }
    if (promo.expiresAt && promo.expiresAt < now) {
      return res.status(400).json({ success: false, message: 'Your regional promotion has expired.' })
    }

    // 4. Verify region / country eligibility
    if (promo.regionCode !== offer.regionCode) {
      return res.status(400).json({ success: false, message: 'This promotion is not available in your region.' })
    }
    if (promo.countryCodes && promo.countryCodes.length > 0 && !promo.countryCodes.includes(offer.countryCode)) {
      return res.status(400).json({ success: false, message: 'This promotion is not available in your country.' })
    }

    // 5. Verify usage limit
    if (promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ success: false, message: 'This promotion is no longer available.' })
    }

    // 6. Verify seller hasn't redeemed this code already
    const alreadyRedeemed = await SellerRegistrationOffer.findOne({
      userId: req.user._id,
      promoCode: promo.code,
      status: 'PAID'
    })
    if (alreadyRedeemed) {
      return res.status(400).json({ success: false, message: 'You have already redeemed this promotion.' })
    }

    // 7. Apply the promo code discount to the offer
    offer.promoCode = promo.code
    offer.discountType = promo.discountType
    offer.discountValue = promo.discountValue
    offer.discountAmount = promo.discountType === 'percentage'
      ? Number(((offer.baseAmount * promo.discountValue) / 100).toFixed(2))
      : promo.discountValue
    offer.finalAmount = Math.max(0, Number((offer.baseAmount - offer.discountAmount).toFixed(2)))

    await offer.save()

    res.json({
      success: true,
      message: 'Promo code applied successfully.',
      finalAmount: offer.finalAmount,
      discountAmount: offer.discountAmount,
      promo: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue
      }
    })
  } catch (error) {
    console.error('Error validating promo code:', error)
    res.status(500).json({ success: false, message: 'Validation failed.' })
  }
}

/**
 * POST /api/seller-registration/create-payment
 * Create a Razorpay checkout order for the server-side calculated registration fee.
 */
exports.createPayment = async (req, res) => {
  try {
    const { offerId } = req.body

    if (!offerId) {
      return res.status(400).json({ success: false, message: 'Offer ID is required.' })
    }

    // 1. Retrieve the legitimate registration offer
    const offer = await SellerRegistrationOffer.findOne({ _id: offerId, userId: req.user._id })
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Registration offer not found.' })
    }

    // Prevent double payment
    if (offer.status === 'PAID') {
      return res.status(400).json({ success: false, message: 'This registration offer has already been paid.' })
    }

    if (offer.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Your seller registration offer has expired. Please refresh.' })
    }

    // 2. Fetch exchange rates and convert amount from USD to INR
    const rates = await currencyService.getExchangeRates()
    const finalAmountUSD = offer.finalAmount
    const finalAmountINR = currencyService.convertAmount(finalAmountUSD, 'INR', rates)
    const amountInPaise = Math.round(finalAmountINR * 100)

    if (amountInPaise <= 0) {
      // If final price is 0, let's update state directly as PAID
      offer.status = 'PAID'
      await offer.save()
      return res.json({
        success: true,
        isFree: true,
        message: 'Registration is free. No payment required.'
      })
    }

    // 3. Create Razorpay order using the SERVER-SIDE calculated INR amount
    let razorpayOrder
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `seller_reg_${offer._id}_${Date.now()}`,
        notes: {
          userId: req.user._id.toString(),
          offerId: offer._id.toString(),
          type: 'seller_registration_fee'
        }
      })
    } catch (rzpErr) {
      console.error('Razorpay order creation failed:', rzpErr.message || rzpErr)
      return res.status(500).json({ success: false, message: 'Payment could not be started.' })
    }

    // 4. Update the offer status to PAYMENT_PROCESSING
    offer.status = 'PAYMENT_PROCESSING'
    await offer.save()

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      amountUSD: finalAmountUSD,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID
    })
  } catch (error) {
    console.error('Error starting seller registration payment:', error)
    res.status(500).json({ success: false, message: 'Payment could not be started.' })
  }
}
