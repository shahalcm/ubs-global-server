const axios = require('axios')

/**
 * Send Expo Push Notification for Incoming Calls
 * @param {Object} params
 * @param {string} params.pushToken - Expo push token (e.g. ExponentPushToken[xxx])
 * @param {string} params.callerName - Name of caller
 * @param {string} params.callId - Database call ID
 * @param {string} params.channelId - WebRTC channel ID
 * @param {string} params.callerType - 'admin' | 'user' | 'seller'
 */
const sendIncomingCallNotification = async ({ pushToken, callerName, callId, channelId, callerType = 'user' }) => {
  if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken')) {
    console.log(`[Push Notification Skipped] Invalid or missing Expo push token: ${pushToken}`)
    return false
  }

  try {
    console.log(`[Sending Push Notification] Calling ${callerName} (CallId: ${callId})`)
    const response = await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken,
      sound: 'default',
      priority: 'high',
      title: `📞 Incoming Call from ${callerName}`,
      body: `Tap to answer call from ${callerName}`,
      data: {
        type: 'INCOMING_CALL',
        callId,
        channelId,
        callerName,
        callerType
      },
      _displayInForeground: true
    }, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      timeout: 5000
    })

    console.log('[Push Notification Sent Successfully]', response.data)
    return true
  } catch (error) {
    console.error('[Push Notification Error]', error.response?.data || error.message)
    return false
  }
}

module.exports = {
  sendIncomingCallNotification
}
