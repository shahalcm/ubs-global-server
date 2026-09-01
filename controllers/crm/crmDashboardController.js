const User = require('../../models/User')
const Seller = require('../../models/Seller')
const Order = require('../../models/Order')
const CRMLead = require('../../models/CRMLead')
const CRMFollowUp = require('../../models/CRMFollowUp')
const CRMSupportTicket = require('../../models/CRMSupportTicket')
const CRMActivity = require('../../models/CRMActivity')
const CRMTask = require('../../models/CRMTask')

exports.getDashboardStats = async (req, res) => {
  try {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const startOf30DaysAgo = new Date()
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30)

    // 1. Customer metrics
    const totalCustomers = await User.countDocuments({ role: 'buyer', isDeleted: { $ne: true } })
    const newCustomers30d = await User.countDocuments({ role: 'buyer', createdAt: { $gte: startOf30DaysAgo } })

    // 2. Seller metrics
    const totalSellers = await Seller.countDocuments()
    const activeSellers = await Seller.countDocuments({ status: 'approved' })
    const pendingSellers = await Seller.countDocuments({ status: 'pending' })

    // 3. Lead metrics
    const totalLeads = await CRMLead.countDocuments()
    const newLeads = await CRMLead.countDocuments({ status: 'NEW' })
    const convertedLeads = await CRMLead.countDocuments({ status: 'CONVERTED' })
    const leadConversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0'

    // 4. Follow-ups & Tasks due today
    const followUpsDueToday = await CRMFollowUp.find({
      dueDate: { $gte: startOfToday, $lte: endOfToday },
      status: 'PENDING'
    }).populate('assignedTo', 'name avatar').limit(10)

    const tasksPendingToday = await CRMTask.find({
      status: { $in: ['TODO', 'IN_PROGRESS'] }
    }).populate('assignedTo', 'name avatar').limit(10)

    // 5. Open Support Tickets
    const openSupportTickets = await CRMSupportTicket.countDocuments({
      status: { $in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] }
    })

    // 6. Revenue Aggregations
    const todayOrders = await Order.aggregate([
      { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday }, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ])

    const totalRevenueAgg = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ])

    const todayRevenue = todayOrders[0]?.total || 0
    const totalRevenue = totalRevenueAgg[0]?.total || 0

    // 7. Recent activity timeline
    const recentActivities = await CRMActivity.find()
      .sort({ createdAt: -1 })
      .limit(10)

    // 8. 7-day revenue trend chart data
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toISOString().split('T')[0]
    })

    const revenueTrends = await Promise.all(
      last7Days.map(async (dateStr) => {
        const dayStart = new Date(dateStr)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dateStr)
        dayEnd.setHours(23, 59, 59, 999)

        const agg = await Order.aggregate([
          { $match: { createdAt: { $gte: dayStart, $lte: dayEnd }, paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$grandTotal' } } }
        ])
        return {
          date: dateStr,
          revenue: agg[0]?.total || 0
        }
      })
    )

    res.status(200).json({
      success: true,
      stats: {
        totalCustomers,
        newCustomers30d,
        totalSellers,
        activeSellers,
        pendingSellers,
        totalLeads,
        newLeads,
        convertedLeads,
        leadConversionRate: parseFloat(leadConversionRate),
        openSupportTickets,
        todayRevenue,
        totalRevenue
      },
      followUpsDueToday,
      tasksPendingToday,
      recentActivities,
      revenueTrends
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
