const mongoose = require('mongoose')

const connectDB = async (retries = 5, backoffMs = 5000) => {
  const mongoURI = process.env.MONGO_URI
  if (!mongoURI) {
    console.error('❌ MongoDB Error: MONGO_URI is not defined in environment')
    return
  }

  mongoose.set('bufferTimeoutMS', 10000)

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connection established')
  })

  mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB connection error:', error.message || error)
  })

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected')
  })

  const attempt = async (remaining) => {
    try {
      const conn = await mongoose.connect(mongoURI, {
        // keep defaults; mongoose 6+ uses proper defaults
      })
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
      console.log(`📦 Database: ${conn.connection.name}`)
      return
    } catch (error) {
      console.error(`❌ MongoDB Error: ${error.message}`)
      if (remaining > 0) {
        console.log(`Retrying MongoDB connection in ${backoffMs / 1000}s... (${remaining} attempts left)`)
        setTimeout(() => attempt(remaining - 1), backoffMs)
      } else {
        console.error('❌ MongoDB: all connection attempts failed. Server will keep running and retry in background.')
      }
    }
  }

  // Start attempts
  await attempt(retries)
}

module.exports = connectDB