require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const mongoose = require('mongoose')
const Country = require('../models/Country')
const RegionalPricingRule = require('../models/RegionalPricingRule')
const PromoCode = require('../models/PromoCode')
const SellerRegistrationOffer = require('../models/SellerRegistrationOffer')
const User = require('../models/User')
const Seller = require('../models/Seller')
const Transaction = require('../models/Transaction')
const seedPricingData = require('../utils/seedPricingData')

// Controllers to test
const { getRegistrationOffer, validatePromoCode, createPayment } = require('../controllers/sellerRegistrationController')
const { applyAsSeller } = require('../controllers/sellerController')

// Helper for mocking req, res
const mockResponse = () => {
  const res = {}
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (data) => {
    res.body = data
    return res
  }
  return res
}

const runTests = async () => {
  try {
    console.log('⚡ Connecting to database...')
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    })
    console.log('✅ Connected to MongoDB')

    // Clean up past test entities
    console.log('🧹 Cleaning up test users and offers...')
    const testEmailPrefix = 'test.pricing.'
    await User.deleteMany({ email: { $regex: `^${testEmailPrefix}` } })
    await SellerRegistrationOffer.deleteMany({})
    
    // Seed standard rules, promos, and country mappings if not present
    await seedPricingData()

    // 1. Create Mock Users
    console.log('👥 Creating mock test users...')
    const usUser = await User.create({
      name: 'US Seller Test',
      email: `${testEmailPrefix}us@ubs-global.com`,
      phone: '+15551111111',
      countryCode: 'US',
      countryName: 'United States',
      role: 'buyer'
    })

    const aeUser = await User.create({
      name: 'AE Seller Test',
      email: `${testEmailPrefix}ae@ubs-global.com`,
      phone: '+9715551111111',
      countryCode: 'AE',
      countryName: 'United Arab Emirates',
      role: 'buyer'
    })

    const inUser = await User.create({
      name: 'IN Seller Test',
      email: `${testEmailPrefix}in@ubs-global.com`,
      phone: '+919999999999',
      countryCode: 'IN',
      countryName: 'India',
      role: 'buyer'
    })

    const results = []

    // Helper to evaluate and push test result
    const recordResult = (name, passed, detail = '') => {
      console.log(`${passed ? '🟢 PASS' : '🔴 FAIL'}: ${name} ${detail ? `(${detail})` : ''}`)
      results.push({ name, status: passed ? 'PASS' : 'FAIL', detail })
    }

    // ----------------------------------------------------
    // TEST 1: High-cost country offer calculation
    // ----------------------------------------------------
    let req = { user: usUser, headers: {}, socket: { remoteAddress: '12.34.56.78' } }
    let res = mockResponse()
    await getRegistrationOffer(req, res)
    const usOffer = res.body
    
    const test1 = usOffer.success && usOffer.region === 'HIGH_COST' && usOffer.finalAmount === 200 && !usOffer.promo.available
    recordResult('High-cost country offer', test1, `Region: ${usOffer.region}, Fee: $${usOffer.finalAmount}, Promo code active: ${usOffer.promo?.available}`)

    // ----------------------------------------------------
    // TEST 2: Middle-cost country offer calculation
    // ----------------------------------------------------
    req = { user: aeUser, headers: {}, socket: { remoteAddress: '12.34.56.78' } }
    res = mockResponse()
    await getRegistrationOffer(req, res)
    const aeOffer = res.body
    
    const test2 = aeOffer.success && aeOffer.region === 'MIDDLE_COST' && aeOffer.finalAmount === 120 && aeOffer.promo.code === 'UBSMIDDLE40'
    recordResult('Middle-cost country offer', test2, `Region: ${aeOffer.region}, Fee: $${aeOffer.finalAmount}, Promo code: ${aeOffer.promo?.code}`)

    // ----------------------------------------------------
    // TEST 3: Low-cost country offer calculation
    // ----------------------------------------------------
    req = { user: inUser, headers: {}, socket: { remoteAddress: '12.34.56.78' } }
    res = mockResponse()
    await getRegistrationOffer(req, res)
    const inOffer = res.body
    
    const test3 = inOffer.success && inOffer.region === 'LOW_COST' && inOffer.finalAmount === 80 && inOffer.promo.code === 'UBSLOW60'
    recordResult('Low-cost country offer', test3, `Region: ${inOffer.region}, Fee: $${inOffer.finalAmount}, Promo code: ${inOffer.promo?.code}`)

    // ----------------------------------------------------
    // TEST 3.5: VIP free phone number offer calculation
    // ----------------------------------------------------
    const vipUser = await User.create({
      name: 'VIP Seller Test',
      email: `${testEmailPrefix}vip@ubs-global.com`,
      phone: '+919744367826',
      countryCode: 'IN',
      countryName: 'India',
      role: 'buyer'
    })
    req = { user: vipUser, headers: {}, socket: { remoteAddress: '12.34.56.78' } }
    res = mockResponse()
    await getRegistrationOffer(req, res)
    const vipOffer = res.body
    
    const testVip = vipOffer.success && vipOffer.finalAmount === 0 && vipOffer.promo.code === 'VIP_FREE'
    recordResult('VIP Free phone number offer', testVip, `Fee: $${vipOffer.finalAmount}, Promo: ${vipOffer.promo?.code}`)

    // ----------------------------------------------------
    // TEST 4: Validate Promo code regions (LOW_COST coupon on HIGH_COST user)
    // ----------------------------------------------------
    req = { user: usUser, body: { offerId: usOffer.offerId, code: 'UBSLOW60' } }
    res = mockResponse()
    await validatePromoCode(req, res)
    
    const test4 = res.statusCode === 400 && res.body.success === false && res.body.message.includes('region')
    recordResult('Reject coupon outside eligible region', test4, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)

    // ----------------------------------------------------
    // TEST 5: Validate Expired Promo code
    // ----------------------------------------------------
    // Create expired promo
    const expiredPromo = await PromoCode.create({
      code: 'EXPIREDTEST',
      discountType: 'percentage',
      discountValue: 50,
      regionCode: 'LOW_COST',
      isActive: true,
      startsAt: new Date(Date.now() - 40 * 60 * 1000),
      expiresAt: new Date(Date.now() - 10 * 60 * 1000)
    })

    req = { user: inUser, body: { offerId: inOffer.offerId, code: 'EXPIREDTEST' } }
    res = mockResponse()
    await validatePromoCode(req, res)
    
    const test5 = res.statusCode === 400 && res.body.success === false && res.body.message.toLowerCase().includes('expired')
    recordResult('Reject expired promo code', test5, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)
    await PromoCode.findByIdAndDelete(expiredPromo._id)

    // ----------------------------------------------------
    // TEST 6: Validate Disabled Promo code
    // ----------------------------------------------------
    const disabledPromo = await PromoCode.create({
      code: 'DISABLEDTEST',
      discountType: 'percentage',
      discountValue: 50,
      regionCode: 'LOW_COST',
      isActive: false
    })

    req = { user: inUser, body: { offerId: inOffer.offerId, code: 'DISABLEDTEST' } }
    res = mockResponse()
    await validatePromoCode(req, res)
    
    const test6 = res.statusCode === 400 && res.body.success === false && res.body.message.toLowerCase().includes('no longer available')
    recordResult('Reject disabled promo code', test6, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)
    await PromoCode.findByIdAndDelete(disabledPromo._id)

    // ----------------------------------------------------
    // TEST 7: Validate Promo maximum usage limit
    // ----------------------------------------------------
    const limitPromo = await PromoCode.create({
      code: 'LIMITTEST',
      discountType: 'percentage',
      discountValue: 50,
      regionCode: 'LOW_COST',
      maxUses: 2,
      usedCount: 2,
      isActive: true
    })

    req = { user: inUser, body: { offerId: inOffer.offerId, code: 'LIMITTEST' } }
    res = mockResponse()
    await validatePromoCode(req, res)
    
    const test7 = res.statusCode === 400 && res.body.success === false && res.body.message.toLowerCase().includes('no longer available')
    recordResult('Reject promo code when usage limit reached', test7, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)
    await PromoCode.findByIdAndDelete(limitPromo._id)

    // ----------------------------------------------------
    // TEST 8: Prevent price/discount tampering
    // ----------------------------------------------------
    // Client tries to bypass payment amount by sending customized details
    req = {
      user: inUser,
      body: {
        shopName: 'Tamper Shop',
        ownerName: 'Scammer',
        phone: '1234567890',
        businessType: 'Importer',
        bankDetails: { bankName: 'Fake', accountNumber: '111', ifscCode: 'ABC' },
        offerId: inOffer.offerId,
        registrationFeeAmount: 1, // TAMPER!
        razorpayOrderId: 'fake_order',
        razorpayPaymentId: 'fake_pay',
        razorpaySignature: 'fake_sig'
      }
    }
    res = mockResponse()
    await applyAsSeller(req, res)
    
    // Should fail signature verification or fee check
    const test8 = res.statusCode === 400 && res.body.success === false
    recordResult('Prevent price/discount tampering', test8, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)

    // ----------------------------------------------------
    // TEST 9: Unauthorized admin route protection
    // ----------------------------------------------------
    // Verify adminProtect middleware block on regular user roles. We can mock middleware call
    const { adminProtect } = require('../middleware/adminAuth')
    req = { headers: { authorization: 'Bearer invalid_token' } }
    res = mockResponse()
    
    await adminProtect(req, res, () => {})
    const test9 = res.statusCode === 401 && res.body.success === false
    recordResult('Prevent unauthorized admin access', test9, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)

    // ----------------------------------------------------
    // TEST 10: Client attempts another user's offer ID
    // ----------------------------------------------------
    // IN user tries to validate or pay using AE user's offer ID
    req = { user: inUser, body: { offerId: aeOffer.offerId, code: 'UBSMIDDLE40' } }
    res = mockResponse()
    await validatePromoCode(req, res)
    
    const test10 = res.statusCode === 404 && res.body.success === false
    recordResult('Reject another seller\'s offer ID validation', test10, `Code: ${res.statusCode}, Msg: ${res.body?.message}`)

    console.log('\n📊 TEST SUITE SUMMARY:')
    const allPassed = results.every(r => r.status === 'PASS')
    if (allPassed) {
      console.log('✅ ALL TESTS PASSED SUCCESSFULLY!')
    } else {
      console.error('❌ SOME TESTS FAILED!')
    }

  } catch (error) {
    console.error('💥 Test execution error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Database connection closed.')
  }
}

runTests()
