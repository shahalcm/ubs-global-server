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
          maxPoolSize: 10, // Maintain up to 10 socket connections
          minPoolSize: 2,  // Keep at least 2 connections
          socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
          serverSelectionTimeoutMS: 5000, // Wait up to 5s to find MongoDB server
          heartbeatFrequencyMS: 10000 // Send heartbeat check every 10s
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