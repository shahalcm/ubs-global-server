const twilio = require('twilio')
const OTP = require('../models/OTP')

let client;
const getClient = () => {
  if (!client) {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }
  return client;
};

const normalizePhone = (phone) => {
  if (!phone) return ''
  let cleaned = String(phone).trim().replace(/[\s\-\(\)]/g, '')
  if (/^\d{10}$/.test(cleaned)) {
    cleaned = '+91' + cleaned
  } else if (/^91\d{10}$/.test(cleaned)) {
    cleaned = '+' + cleaned
  } else if (!cleaned.startsWith('+') && cleaned.length > 0) {
    cleaned = '+' + cleaned
  }
  return cleaned
}

exports.normalizePhone = normalizePhone

exports.sendOTP = async (phone) => {
  const normPhone = normalizePhone(phone)
  const rawPhone = (phone || '').trim()
  const otp = Math.floor(100000 + Math.random() * 900000).toString()

  // Clean up previous OTPs for this phone number
  await OTP.deleteMany({
    phone: { $in: [normPhone, rawPhone, phone].filter(Boolean) }
  }).catch(() => null)

  // Save new OTP with normalized phone number
  await OTP.create({
    phone: normPhone,
    otp: otp
  })

  console.log(`📱 [sendOTP] Generated OTP ${otp} for phone ${normPhone} (raw: ${phone})`)

  const twilioClient = getClient();
  if (twilioClient && normPhone !== '+917777777777') {
    try {
      await twilioClient.messages.create({
        body: `Your UBS Global OTP: ${otp}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: normPhone
      })
    } catch (twilioError) {
      console.error('❌ Twilio send error:', twilioError.message);
    }
  }
  return otp
}

exports.verifyOTP = async (phone, otp) => {
  const normPhone = normalizePhone(phone)
  const rawPhone = (phone || '').trim()
  const cleanOtp = (otp || '').trim()

  if (!phone || !cleanOtp) {
    console.warn('⚠️ [verifyOTP] Missing phone or OTP parameters')
    return false
  }

  // Allow default test OTP for test number in development
  if (
    process.env.NODE_ENV === 'development' &&
    normPhone === '+917777777777' &&
    cleanOtp === '123456'
  ) {
    return true
  }

  // Find active, unexpired, unused OTP record using normalized and raw phone variations
  const phoneVariations = Array.from(new Set([
    normPhone,
    rawPhone,
    phone,
    rawPhone.replace(/^\+91/, ''),
    rawPhone.replace(/^91/, ''),
    normPhone.replace(/^\+91/, '')
  ])).filter(Boolean)

  const record = await OTP.findOne({
    phone: { $in: phoneVariations },
    isUsed: false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 })

  if (!record) {
    console.warn(`⚠️ [verifyOTP] No active OTP record found for phone variations:`, phoneVariations)
    return false
  }

  if (record.attempts && record.attempts >= 5) {
    console.warn(`⚠️ [verifyOTP] OTP attempt limit reached for phone: ${normPhone}`)
    await OTP.deleteOne({ _id: record._id }).catch(() => null)
    return false
  }

  if (record.otp !== cleanOtp) {
    console.warn(`⚠️ [verifyOTP] OTP mismatch for phone: ${normPhone}. Expected: "${record.otp}", Received: "${cleanOtp}"`)
    record.attempts = (record.attempts || 0) + 1
    await record.save().catch(() => null)
    return false
  }

  // Mark as used and remove
  record.isUsed = true
  await record.save().catch(() => null)
  await OTP.deleteOne({ _id: record._id }).catch(() => null)
  console.log(`✅ [verifyOTP] OTP verified successfully for phone: ${normPhone}`)
  return true
}