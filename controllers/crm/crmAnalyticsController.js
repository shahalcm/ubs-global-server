const User = require('../../models/User')
const Seller = require('../../models/Seller')
const Order = require('../../models/Order')
const CRMLead = require('../../models/CRMLead')
const CRMSupportTicket = require('../../models/CRMSupportTicket')
const CRMFollowUp = require('../../models/CRMFollowUp')

exports.getAnalytics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query

    const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Customer growth
    const totalCustomers = await User.countDocuments({ role: 'buyer' })
    const newCustomersPeriod = await User.countDocuments({ role: 'buyer', createdAt: { $gte: startDate } })

    // Seller growth
    const totalSellers = await Seller.countDocuments()
    const newSellersPeriod = await Seller.countDocuments({ createdAt: { $gte: startDate } })

    // Lead metrics
    const leadStats = await CRMLead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])

    // Order metrics
    const orderAgg = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$grandTotal' }
        }
      }
    ])

    // Support SLA metrics
    const totalTickets = await CRMSupportTicket.countDocuments({ createdAt: { $gte: startDate } })
    const resolvedTickets = await CRMSupportTicket.countDocuments({ status: 'RESOLVED', createdAt: { $gte: startDate } })
    const resolutionRate = totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(1) : '100.0'

    res.status(200).json({
      success: true,
      timeframe,
      metrics: {
        totalCustomers,
        newCustomersPeriod,
        totalSellers,
        newSellersPeriod,
        revenue: orderAgg[0]?.totalRevenue || 0,
        ordersCount: orderAgg[0]?.totalOrders || 0,
        avgOrderValue: orderAgg[0]?.avgOrderValue || 0,
        leadStats,
        resolutionRate: parseFloat(resolutionRate)
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
