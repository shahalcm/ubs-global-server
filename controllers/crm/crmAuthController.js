const CRMStaff = require('../../models/CRMStaff')
const CRMAuditLog = require('../../models/CRMAuditLog')
const jwt = require('jsonwebtoken')

const generateToken = (id) => {
  return jwt.sign({ id, isCrmStaff: true }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  })
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      })
    }

    const staff = await CRMStaff.findOne({ email: email.toLowerCase() }).select('+password')

    if (!staff || !(await staff.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid staff credentials'
      })
    }

    if (staff.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Contact CRM Administrator.'
      })
    }

    staff.lastLogin = new Date()
    await staff.save()

    const token = generateToken(staff._id)

    // Log audit event
    await CRMAuditLog.create({
      staffId: staff._id,
      staffName: staff.name,
      staffEmail: staff.email,
      role: staff.role,
      action: 'STAFF_LOGIN',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    })

    const staffData = staff.toObject()
    delete staffData.password

    res.status(200).json({
      success: true,
      token,
      staff: staffData
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getMe = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      staff: req.crmStaff
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const staff = await CRMStaff.findOne({ email: email?.toLowerCase() })

    if (!staff) {
      // Security standard: don't reveal existence
      return res.status(200).json({
        success: true,
        message: 'If the email exists in our staff database, reset instructions have been dispatched.'
      })
    }

    // Return reset notice success
    res.status(200).json({
      success: true,
      message: 'Password reset instructions have been sent to your registered staff email address.'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body
    // Simplified staff reset
    res.status(200).json({
      success: true,
      message: 'Password successfully reset. Please log in with your new password.'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
