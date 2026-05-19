const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const passport = require('passport')
require('dotenv').config()

const connectDB = require('./config/db')
require('./config/passport')

const app = express()
const server = http.createServer(app)

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL,
      process.env.ADMIN_URL,
      'http://localhost:8081',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST']
  }
})

// Make io accessible globally
global.io = io

// Connect Database
connectDB()

// Security middleware
app.use(helmet())
app.use(compression())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
})
app.use('/api/', limiter)

// CORS
app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:5173',
    'http://10.0.2.2:5000'
  ],
  credentials: true
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// Passport
app.use(passport.initialize())

// Health check
app.get('/', (req, res) => {
  const mongoose = require('mongoose')
  res.json({
    message: '🚀 UBS Global API Running',
    version: '1.0.0',
    database: mongoose && mongoose.connection && mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  })
})

// DB-ready middleware: return 503 if DB not connected
app.use((req, res, next) => {
  const mongoose = require('mongoose')
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ success: false, message: 'Service unavailable: database not connected' })
  }
  next()
})

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/sellers', require('./routes/sellers'))
app.use('/api/products', require('./routes/products'))
app.use('/api/cart', require('./routes/cart'))
app.use('/api/wishlist', require('./routes/wishlist'))
app.use('/api/orders', require('./routes/orders'))
app.use('/api/categories', require('./routes/categories'))
app.use('/api/payments', require('./routes/payments'))
app.use('/api/messages', require('./routes/messages'))
app.use('/api/contact-requests', require('./routes/contactRequests'))
app.use('/api/chat', require('./routes/chat'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/reviews', require('./routes/reviews'))
app.use('/api/banners', require('./routes/banners'))
app.use('/api/admin', require('./routes/admin'))

// Socket handler
require('./socket/socketHandler')(io)

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📱 Client URL: ${process.env.CLIENT_URL}`)
  console.log(`🖥️  Admin URL: ${process.env.ADMIN_URL}`)
})