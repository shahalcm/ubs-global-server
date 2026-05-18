const admin = require('firebase-admin')
const Notification = require('../models/Notification')

let firebaseApp = null

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    })
  } catch (error) {
    console.log('Firebase init error:', error.message)
  }
}

exports.createInAppNotification = async ({ userId, userType = 'User', title, message, type = 'system', data = null }) => {
  try {
    return await Notification.create({
      userId,
      userType,
      title,
      message,
      type,
      data,
      isRead: false
    })
  } catch (error) {
    console.log('Notification save error:', error.message)
    return null
  }
}

exports.sendPushNotification = async (user, payload) => {
  if (!firebaseApp || !user || !user.fcmToken) return null
  try {
    const message = {
      token: user.fcmToken,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data || {}
    }
    await admin.messaging().send(message)
  } catch (error) {
    console.log('Push notification error:', error.message)
  }
}
