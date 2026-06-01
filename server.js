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
const validateEnv = require('./utils/envValidate')
validateEnv()

const connectDB = require('./config/db')
require('./config/passport')

const app = express()

// FIX FOR RENDER PROXY
app.set('trust proxy', 1)

const server = http.createServer(app)

// Allowed origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  'http://localhost:8081',
  'http://localhost:5173',
  'http://127.0.0.1:8081',
  'http://10.0.2.2:8081',
  'https://ubs-global-server-production.up.railway.app',
  'https://ubs-global-server-production.up.railway.app/api',
  'https://ubs-global-admin.vercel.app',
  'https://ubs-global-adminpanel.vercel.app',
  'https://admin.ubsglobalapp.com'
]

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  pingTimeout: 120000,                  // Increased to 2 minutes
  pingInterval: 30000,                  // Increased to 30 seconds
  maxHttpBufferSize: 1e6,               // 1MB max message size
  allowEIO3: true,                      // Support older Socket.IO clients
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
})

// Make io globally accessible
global.io = io

// Connect database
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

// CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`⚠️ Blocked by CORS: Origin [${origin}] is not in the whitelist.`);
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}))

// Serve static uploads
const path = require('path')
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// Passport
app.use(passport.initialize())

// Health check route
app.get('/', (req, res) => {
  const mongoose = require('mongoose')

  res.json({
    message: '🚀 UBS Global API Running',
    version: '1.0.0',
    database:
      mongoose.connection.readyState === 1
        ? 'Connected'
        : 'Disconnected'
  })
})

// Database connection check middleware
app.use((req, res, next) => {
  const mongoose = require('mongoose')

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Service unavailable: database not connected'
    })
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
app.use('/api/properties', require('./routes/properties'))
app.use('/api/bot-config', require('./routes/botConfig'))
app.use('/api/calls', require('./routes/callRoutes'))

// Socket handler
require('./socket/socketHandler')(io)
require('./socket/callSocket')(io)

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📱 Client URL: ${process.env.CLIENT_URL}`)
  console.log(`🖥️ Admin URL: ${process.env.ADMIN_URL}`)
})

// Global exception safety nets
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION PREVENTED CRASH:', error.stack || error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION AT:', promise, 'REASON:', reason)
})