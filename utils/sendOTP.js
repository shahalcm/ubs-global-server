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
      console.error('❌ Twilio send error, falling back to mock OTP:', twilioError.message);
      console.log(`[MOCK OTP - Twilio Fail] Would have sent OTP ${otp} to ${phone}`);
    }
  } else {
    console.log(`[MOCK OTP] Would have sent OTP ${otp} to ${phone}`);
  }
  return otp
}

exports.verifyOTP = async (phone, otp) => {
  // Allow a default bypass OTP in development environment, or for the test phone number in production
  if (
    (process.env.NODE_ENV === 'development' || phone === '+917777777777') &&
    otp === '123456'
  ) {
    return true
  }

  const record = await OTP.findOne({
    phone,
    otp,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  })
  if (!record) return false
  record.isUsed = true
  await record.save()
  return true
}