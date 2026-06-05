const User = require('../models/User')
const bcrypt = require('bcryptjs')
const { generateUserToken, generateAdminToken } = require('../utils/generateToken')
const { sendOTP, verifyOTP } = require('../utils/sendOTP')

// Send OTP
exports.sendOTP = async (req, res) => {
  const { phone } = req.body
  const otp = await sendOTP(phone)
  if (process.env.NODE_ENV === 'development') {
    res.json({ success: true, message: 'OTP sent', otp })
  } else {
    res.json({ success: true, message: 'OTP sent' })
  }
}

// Verify OTP
exports.verifyOTP = async (req, res) => {
  const { phone, otp } = req.body
  const isValid = await verifyOTP(phone, otp)
  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP'
    })
  }
  res.json({ success: true, message: 'OTP verified' })
}

// Complete signup
exports.signup = async (req, res) => {
  const { name, email, password, phone, location } = req.body
  const hashedPassword = await bcrypt.hash(password, 12)
  const user = await User.create({
    name, email, phone,
    password: hashedPassword,
    isVerified: true,
    location
  })
  const token = generateUserToken(user._id)
  res.status(201).json({ success: true, token, user })
}

// Login
exports.login = async (req, res) => {
  const { phone, otp } = req.body
  const user = await User.findOne({ phone })
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    })
  }
  const token = generateUserToken(user._id)
  user.lastLogin = new Date()
  await user.save()
  res.json({ success: true, token, user })
}

// Admin login
exports.adminLogin = async (req, res) => {
  const { email, password } = req.body
  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin credentials'
    })
  }
  const token = generateAdminToken({
    email,
    name: 'UBS Admin',
    role: 'admin'
  })
  res.json({
    success: true,
    token,
    admin: { email, name: 'UBS Admin', role: 'admin' }
  })
}

// Google mobile auth
exports.googleMobileAuth = async (req, res) => {
  const { googleId, name, email, avatar } = req.body
  let user = await User.findOne({ googleId })
  if (!user) {
    user = await User.findOne({ email })
    if (user) {
      user.googleId = googleId
      user.avatar = avatar
      await user.save()
    } else {
      user = await User.create({
        googleId, name, email,
        avatar, isVerified: true
      })
    }
  }
  const token = generateUserToken(user._id)
  res.json({ success: true, token, user })
}