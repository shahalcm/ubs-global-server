const jwt = require('jsonwebtoken')
exports.adminProtect = async (req, res, next) => {
  try {
    let token
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1]
    }
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Admin access required'
      })
    }
    const decoded = jwt.verify(
      token,
      process.env.ADMIN_JWT_SECRET
    )
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access only'
      })
    }
    req.admin = decoded
    next()
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Admin token invalid'
    })
  }
}