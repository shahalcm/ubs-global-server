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

// Login (supports both password and phone lookup)
exports.login = async (req, res) => {
  try {
    const { phone, email, password, otp } = req.body

    let query = {}
    const cleanPhone = phone ? phone.trim().replace(/\s+/g, '') : null
    const cleanEmail = email ? email.trim().toLowerCase() : null

    if (cleanPhone) query.phone = { $in: [cleanPhone, phone.trim()] }
    else if (cleanEmail) query.email = cleanEmail
    else {
      return res.status(400).json({ success: false, message: 'Phone number or email is required' })
    }

    const user = await User.findOne(query).select('+password')
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with these credentials. Please check or sign up.'
      })
    }

    // 1. Password Login Flow
    if (password) {
      if (!user.password) {
        return res.status(400).json({
          success: false,
          message: 'No password set for this account. Please login using OTP.'
        })
      }
      const isMatch = await bcrypt.compare(password, user.password)
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect password. Please try again or click Forgot Password.'
        })
      }
    } 
    // 2. Direct OTP Payload Flow
    else if (otp) {
      const isValid = await verifyOTP(cleanPhone || user.phone, otp)
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
      }
    } 
    // 3. Post-OTP Verification Session Flow (Phone verified within last 5 minutes)
    else if (cleanPhone) {
      const OTP = require('../models/OTP')
      const recentOtpRecord = await OTP.findOne({
        phone: { $in: [cleanPhone, phone.trim()] },
        isUsed: true,
        updatedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      })
      if (!recentOtpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Password or valid OTP verification is required to log in.'
        })
      }
    } 
    else {
      return res.status(400).json({
        success: false,
        message: 'Password or OTP is required to log in.'
      })
    }

    const token = generateUserToken(user._id)
    user.lastLogin = new Date()
    await user.save()

    user.password = undefined

    res.json({ success: true, token, user })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Forgot Password - Send OTP to registered user
exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' })
    }

    const user = await User.findOne({ phone: phone.trim() })
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No registered account found with this phone number. Please check or sign up.'
      })
    }

    const otp = await sendOTP(phone.trim())
    if (process.env.NODE_ENV === 'development') {
      res.json({ success: true, message: 'OTP sent for password reset', otp })
    } else {
      res.json({ success: true, message: 'OTP sent for password reset' })
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Reset Password with OTP
exports.resetPasswordOtp = async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body
    if (!phone || !newPassword) {
      return res.status(400).json({ success: false, message: 'Phone and new password are required' })
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '')
    if (!cleanOtp) {
      return res.status(400).json({ success: false, message: 'OTP is required for password reset' })
    }

    const isValid = await verifyOTP(cleanPhone, cleanOtp, true)
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' })
    }

    const user = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: phone.trim() }
      ]
    }).select('+password')

    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered user found with this phone number' })
    }

    const hashedPassword = await bcrypt.hash(newPassword.trim(), 12)
    user.password = hashedPassword
    user.lastLogin = new Date()
    await user.save()

    const token = generateUserToken(user._id)
    user.password = undefined

    res.json({
      success: true,
      message: 'Password reset successfully. You are now logged in.',
      token,
      user
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
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

// Set user role (buyer or seller)
exports.setRole = async (req, res) => {
  try {
    const { role } = req.body
    if (!['buyer', 'seller'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selection'
      })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    user.role = role
    await user.save()

    res.json({
      success: true,
      message: 'Role updated successfully',
      user
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}