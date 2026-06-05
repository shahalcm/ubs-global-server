const mongoose = require('mongoose')

const systemConfigSchema = new mongoose.Schema({
  // General & Approvals
  requireJobApproval: { type: Boolean, default: true },
  requireServiceApproval: { type: Boolean, default: true },
  supportEmail: { type: String, default: 'ops@ubs-global.com' },
  contactPhone: { type: String, default: '+1 (555) 098-7654' },
  maintenanceMode: { type: Boolean, default: false },
  logoUrl: { type: String, default: '' },
  faviconUrl: { type: String, default: '' },

  // Payments
  stripeEnabled: { type: Boolean, default: true },
  stripePublicKey: { type: String, default: '' },
  stripeSecretKey: { type: String, default: '' },
  stripeMode: { type: String, default: 'test' },
  paypalEnabled: { type: Boolean, default: false },
  paypalClientId: { type: String, default: '' },
  paypalSecret: { type: String, default: '' },
  paypalMode: { type: String, default: 'sandbox' },
  codEnabled: { type: Boolean, default: true },
  codHandlingFee: { type: Boolean, default: false },

  // Shipping
  shippingRate: { type: Number, default: 10 },
  freeShippingThreshold: { type: Number, default: 150 },
  expressShippingRate: { type: Number, default: 25 },

  // Languages
  defaultLanguage: { type: String, default: 'en' },
  enabledLanguages: { type: [String], default: ['en', 'es', 'fr'] },

  // Security
  twoFactorMandatory: { type: Boolean, default: false },
  sessionTimeout: { type: Number, default: 30 },
  ipWhitelist: { type: String, default: '192.168.1.1, 10.0.0.45' },

  // Notifications
  emailAlerts: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: false },
  pushNotifications: { type: Boolean, default: true },

  // API Integrations
  apiKeys: [
    {
      name: { type: String, required: true },
      key: { type: String, required: true },
      status: { type: String, enum: ['active', 'revoked'], default: 'active' },
      lastUsed: { type: Date }
    }
  ]
}, { timestamps: true })

module.exports = mongoose.model('SystemConfig', systemConfigSchema)
