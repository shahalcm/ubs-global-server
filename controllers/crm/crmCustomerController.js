const User = require('../../models/User')
const Order = require('../../models/Order')
const CRMSupportTicket = require('../../models/CRMSupportTicket')
const CRMNote = require('../../models/CRMNote')
const CRMActivity = require('../../models/CRMActivity')
const CRMFollowUp = require('../../models/CRMFollowUp')

exports.getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 15
    const skip = (page - 1) * limit
    const search = req.query.search || ''
    const country = req.query.country || ''
    const status = req.query.status || ''

    const query = { role: 'buyer', isDeleted: { $ne: true } }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ]
    }

    if (country) {
      query['address.country'] = country
    }

    if (status === 'blocked') {
      query.isBlocked = true
    } else if (status === 'active') {
      query.isBlocked = false
    }

    const total = await User.countDocuments(query)
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    // Enrich with order aggregates
    const customerIds = users.map(u => u._id)
    const orderAgg = await Order.aggregate([
      { $match: { buyerId: { $in: customerIds } } },
      {
        $group: {
          _id: '$buyerId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$grandTotal' },
          lastOrderDate: { $max: '$createdAt' }
        }
      }
    ])

    const orderMap = {}
    orderAgg.forEach(item => {
      orderMap[item._id.toString()] = item
    })

    const enrichedCustomers = users.map(user => {
      const stats = orderMap[user._id.toString()] || { totalOrders: 0, totalSpent: 0, lastOrderDate: null }
      return {
        ...user,
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
        lastOrderDate: stats.lastOrderDate
      }
    })

    res.status(200).json({
      success: true,
      customers: enrichedCustomers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getCustomer360 = async (req, res) => {
  try {
    const { id } = req.params
    const customer = await User.findById(id).select('-password').lean()

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      })
    }

    // 1. Orders
    const orders = await Order.find({ buyerId: id })
      .populate('sellerId', 'shopName ownerName')
      .sort({ createdAt: -1 })
      .limit(20)

    // 2. Spending metrics
    const orderStats = await Order.aggregate([
      { $match: { buyerId: customer._id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$grandTotal' },
          avgOrderValue: { $avg: '$grandTotal' }
        }
      }
    ])

    const metrics = orderStats[0] || { totalOrders: 0, totalSpent: 0, avgOrderValue: 0 }

    // 3. Support Tickets
    const tickets = await CRMSupportTicket.find({ customer: id }).sort({ createdAt: -1 })

    // 4. Notes
    const notes = await CRMNote.find({ entityType: 'Customer', entityId: id })
      .populate('author', 'name avatar role')
      .sort({ createdAt: -1 })

    // 5. Follow-ups
    const followups = await CRMFollowUp.find({ entityType: 'Customer', entityId: id })
      .populate('assignedTo', 'name avatar')
      .sort({ dueDate: -1 })

    // 6. Activity Timeline
    const activities = await CRMActivity.find({ entityType: 'Customer', entityId: id })
      .sort({ createdAt: -1 })
      .limit(30)

    res.status(200).json({
      success: true,
      customer: {
        ...customer,
        metrics
      },
      orders,
      tickets,
      notes,
      followups,
      activities
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getCustomerActivity = async (req, res) => {
  try {
    const { id } = req.params
    const activities = await CRMActivity.find({ entityType: 'Customer', entityId: id })
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      activities
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
