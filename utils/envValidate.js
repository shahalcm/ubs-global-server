/**
 * Environment Validation Utility
 * Validates that all required environment variables are present and correct on startup.
 */

const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'ADMIN_JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLIENT_URL',
  'ADMIN_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET'
]

const OPTIONAL_VARS = [
  'PORT',
  'NODE_ENV',
  'ANTHROPIC_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'EMAIL_USER',
  'EMAIL_PASS',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL'
]

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production'
  const missingRequired = []
  const missingOptional = []

  // Check required variables
  for (const key of REQUIRED_VARS) {
    if (!process.env[key] || process.env[key].includes('<your_') || process.env[key].includes('your_')) {
      missingRequired.push(key)
    }
  }

  // Check optional variables
  for (const key of OPTIONAL_VARS) {
    if (!process.env[key] || process.env[key].includes('<your_') || process.env[key].includes('your_')) {
      missingOptional.push(key)
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 PRODUCTION CONFIGURATION AUDIT')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔌 Port Target: ${process.env.PORT || '5000'}`)

  if (missingRequired.length > 0) {
    console.error('❌ CRITICAL ERROR: Missing Required Environment Variables:')
    missingRequired.forEach(v => console.error(`   - ${v}`))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    // In production, force crash to avoid undefined runtime errors
    if (isProduction) {
      console.error('💥 Crash Prevented: Server will shut down due to missing variables in production mode.')
      process.exit(1)
    } else {
      console.warn('⚠️ Warning: Server is running in development mode. Fix the variables listed above.')
    }
  } else {
    console.log('✅ All required environment variables are set.')
  }

  if (missingOptional.length > 0) {
    console.warn('⚠️ Warning: Missing optional configuration variables (some integrations may fail):')
    missingOptional.forEach(v => console.warn(`   - ${v}`))
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

module.exports = validateEnv
