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

exports.sendOTP = async (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  await OTP.deleteMany({ phone })
  await OTP.create({ phone, otp })

  const twilioClient = getClient();
  if (twilioClient && phone !== '+917777777777') {
    try {
      await twilioClient.messages.create({
        body: `Your UBS Global OTP: ${otp}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      })
    } catch (twilioError) {
      console.error('❌ Twilio send error:', twilioError.message);
    }
  }
  return otp
}

exports.verifyOTP = async (phone, otp) => {
  const cleanPhone = (phone || '').trim().replace(/\s+/g, '')
  const cleanOtp = (otp || '').trim()

  if (!cleanPhone || !cleanOtp) {
    return false
  }

  if (
    process.env.NODE_ENV === 'development' &&
    cleanPhone === '+917777777777' &&
    cleanOtp === '123456'
  ) {
    return true
  }

  const record = await OTP.findOne({
    phone: { $in: [cleanPhone, phone] },
    isUsed: false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 })

  if (!record) {
    return false
  }

  if (record.attempts && record.attempts >= 5) {
    console.warn(`⚠️ OTP attempt limit reached for phone: ${cleanPhone}`)
    await OTP.deleteOne({ _id: record._id }).catch(() => null)
    return false
  }

  if (record.otp !== cleanOtp) {
    record.attempts = (record.attempts || 0) + 1
    await record.save().catch(() => null)
    return false
  }

  record.isUsed = true
  await record.save().catch(() => null)
  await OTP.deleteOne({ _id: record._id }).catch(() => null)
  return true
}