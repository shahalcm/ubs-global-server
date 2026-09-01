const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true })
const connectDB = require('../config/db')
const CRMStaff = require('../models/CRMStaff')
const CRMLead = require('../models/CRMLead')
const CRMFollowUp = require('../models/CRMFollowUp')
const CRMTask = require('../models/CRMTask')
const CRMSupportTicket = require('../models/CRMSupportTicket')

const seedCRMData = async () => {
  try {
    await connectDB()
    const mongoose = require('mongoose')
    let checkCount = 0
    while (mongoose.connection.readyState !== 1 && checkCount < 10) {
      await new Promise(res => setTimeout(res, 1000))
      checkCount++
    }
    console.log('🌱 Connected to MongoDB for CRM Seeding...')

    // Seed Super Admin Staff
    let admin = await CRMStaff.findOne({ email: 'admin@ubsglobalcrm.com' })
    if (!admin) {
      admin = await CRMStaff.create({
        name: 'CRM Super Admin',
        email: 'admin@ubsglobalcrm.com',
        password: 'AdminPassword123!',
        role: 'SUPER_ADMIN',
        department: 'Executive Management',
        phone: '+1 (555) 019-2831',
        status: 'active'
      })
      console.log('✅ Super Admin CRM Staff Created: admin@ubsglobalcrm.com / AdminPassword123!')
    } else {
      console.log('ℹ️ Super Admin CRM Staff already exists.')
    }

    // Seed sample sales agent if not exists
    let agent = await CRMStaff.findOne({ email: 'sarah.agent@ubsglobalcrm.com' })
    if (!agent) {
      agent = await CRMStaff.create({
        name: 'Sarah Connor',
        email: 'sarah.agent@ubsglobalcrm.com',
        password: 'AgentPassword123!',
        role: 'SALES_AGENT',
        department: 'Sales',
        phone: '+1 (555) 019-8822',
        status: 'active'
      })
      console.log('✅ Sample Sales Agent Created.')
    }

    // Seed sample leads if empty
    const leadCount = await CRMLead.countDocuments()
    if (leadCount === 0) {
      await CRMLead.create([
        {
          name: 'Apex Global Traders',
          companyName: 'Apex Global Ltd',
          email: 'contact@apexglobal.com',
          phone: '+44 20 7946 0912',
          country: 'United Kingdom',
          type: 'SELLER',
          status: 'QUALIFIED',
          priority: 'HIGH',
          source: 'WEBSITE',
          estimatedValue: 45000,
          assignedTo: agent._id,
          notes: 'Interested in enterprise seller subscription and bulk listing tools.'
        },
        {
          name: 'Rajesh Textiles Exports',
          companyName: 'Rajesh Exports',
          email: 'sales@rajeshtextiles.in',
          phone: '+91 98765 43210',
          country: 'India',
          type: 'BUSINESS',
          status: 'INTERESTED',
          priority: 'MEDIUM',
          source: 'CAMPAIGN',
          estimatedValue: 28000,
          assignedTo: agent._id,
          notes: 'Requested custom catalog onboarding call.'
        },
        {
          name: 'Metro Logistics USA',
          companyName: 'Metro Logistics',
          email: 'info@metrologistics.us',
          phone: '+1 212 555 0199',
          country: 'United States',
          type: 'PARTNERSHIP',
          status: 'NEW',
          priority: 'URGENT',
          source: 'REFERRAL',
          estimatedValue: 120000,
          assignedTo: admin._id,
          notes: 'Freight partner integration request.'
        }
      ])
      console.log('✅ Sample CRM Leads Seeded.')
    }

    // Seed sample followups if empty
    const followupCount = await CRMFollowUp.countDocuments()
    if (followupCount === 0) {
      const today = new Date()
      await CRMFollowUp.create([
        {
          title: 'Schedule Contract Review with Apex Global',
          description: 'Discuss yearly seller commission rates and API access.',
          entityType: 'Lead',
          entityId: (await CRMLead.findOne())?._id,
          entityName: 'Apex Global Traders',
          type: 'CALL',
          dueDate: today,
          assignedTo: agent._id,
          createdBy: admin._id,
          priority: 'HIGH',
          status: 'PENDING'
        }
      ])
      console.log('✅ Sample CRM Follow-ups Seeded.')
    }

    // Seed sample tasks if empty
    const taskCount = await CRMTask.countDocuments()
    if (taskCount === 0) {
      await CRMTask.create([
        {
          title: 'Audit Q3 Seller KYC Submissions',
          description: 'Review pending GST & PAN verification documents.',
          entityType: 'General',
          assignedTo: admin._id,
          createdBy: admin._id,
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 86400000 * 2),
          status: 'IN_PROGRESS',
          tags: ['KYC', 'Compliance']
        }
      ])
      console.log('✅ Sample CRM Tasks Seeded.')
    }

    console.log('🎉 CRM Seed Complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ CRM Seed Failed:', error)
    process.exit(1)
  }
}

seedCRMData()
