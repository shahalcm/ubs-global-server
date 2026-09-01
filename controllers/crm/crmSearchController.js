const User = require('../../models/User')
const Seller = require('../../models/Seller')
const CRMLead = require('../../models/CRMLead')
const CRMTask = require('../../models/CRMTask')
const CRMSupportTicket = require('../../models/CRMSupportTicket')

exports.globalSearch = async (req, res) => {
  try {
    const q = req.query.q || ''
    if (!q || q.trim().length < 2) {
      return res.status(200).json({
        success: true,
        results: {
          customers: [],
          sellers: [],
          leads: [],
          tasks: [],
          tickets: []
        }
      })
    }

    const regex = new RegExp(q.trim(), 'i')

    const [customers, sellers, leads, tasks, tickets] = await Promise.all([
      User.find({
        role: 'buyer',
        isDeleted: { $ne: true },
        $or: [{ name: regex }, { email: regex }, { phone: regex }]
      }).select('name email phone avatar').limit(5).lean(),

      Seller.find({
        $or: [{ shopName: regex }, { ownerName: regex }, { email: regex }]
      }).select('shopName ownerName email shopLogo status').limit(5).lean(),

      CRMLead.find({
        $or: [{ name: regex }, { companyName: regex }, { email: regex }]
      }).select('name companyName email status type').limit(5).lean(),

      CRMTask.find({
        $or: [{ title: regex }, { description: regex }]
      }).select('title status priority dueDate').limit(5).lean(),

      CRMSupportTicket.find({
        $or: [{ ticketNumber: regex }, { subject: regex }, { requesterName: regex }]
      }).select('ticketNumber subject status priority').limit(5).lean()
    ])

    res.status(200).json({
      success: true,
      results: {
        customers,
        sellers,
        leads,
        tasks,
        tickets
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
