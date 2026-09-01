const jwt = require('jsonwebtoken')
const CRMStaff = require('../models/CRMStaff')

exports.protectCRM = async (req, res, next) => {
  try {
    let token
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied: CRM authentication required'
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const staff = await CRMStaff.findById(decoded.id).select('-password')

    if (!staff) {
      return res.status(401).json({
        success: false,
        message: 'Invalid CRM staff session'
      })
    }

    if (staff.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your CRM staff account is inactive or suspended'
      })
    }

    req.crmStaff = staff
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired CRM session token'
    })
  }
}

exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.crmStaff) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized access'
      })
    }

    // SUPER_ADMIN has global access
    if (req.crmStaff.role === 'SUPER_ADMIN') {
      return next()
    }

    if (!allowedRoles.includes(req.crmStaff.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Permission denied for role ${req.crmStaff.role}`
      })
    }

    next()
  }
}
