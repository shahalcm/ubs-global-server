const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const crmStaffSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: [
      'SUPER_ADMIN',
      'CRM_MANAGER',
      'SALES_MANAGER',
      'SALES_AGENT',
      'SUPPORT_MANAGER',
      'SUPPORT_AGENT',
      'RELATIONSHIP_MANAGER',
      'FINANCE_VIEWER',
      'ANALYTICS_VIEWER'
    ],
    default: 'SALES_AGENT'
  },
  avatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80'
  },
  phone: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    default: 'Sales'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  lastLogin: Date,
  assignedCustomersCount: { type: Number, default: 0 },
  assignedSellersCount: { type: Number, default: 0 },
  assignedLeadsCount: { type: Number, default: 0 }
}, { timestamps: true })

crmStaffSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

crmStaffSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

crmStaffSchema.index({ email: 1 })
crmStaffSchema.index({ role: 1 })
crmStaffSchema.index({ status: 1 })

module.exports = mongoose.model('CRMStaff', crmStaffSchema)
