const jwt = require('jsonwebtoken')

exports.generateUserToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  )
}

exports.generateAdminToken = (adminData) => {
  return jwt.sign(
    { ...adminData, role: 'admin' },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '7d' }
  )
}