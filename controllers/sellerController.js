const Seller = require('../models/Seller')
const User = require('../models/User')
const Order = require('../models/Order')
const Product = require('../models/Product')

const getFileUrl = (req, file) => {
  if (!file) return '';
  if (file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))) {
    return file.path;
  }
  const host = req.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.') || host.includes('10.');
  const protocol = isLocal ? req.protocol : 'https';
  const normalizedPath = file.path.replace(/\\/g, '/');
  if (normalizedPath.includes('uploads/products/')) {
    return `${protocol}://${host}/uploads/products/${file.filename}`;
  } else if (normalizedPath.includes('uploads/sellers/')) {
    return `${protocol}://${host}/uploads/sellers/${file.filename}`;
  } else {
    return `${protocol}://${host}/uploads/${file.filename}`;
  }
};

// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  
  let startDate, endDate
  
  if (period === 'week') {
    const dayOfWeek = startOfDay.getDay()
    startDate = new Date(startOfDay)
    startDate.setDate(startDate.getDate() - dayOfWeek)
    endDate = new Date(endOfDay)
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(endOfDay)
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(endOfDay)
  } else {
    startDate = new Date(startOfDay)
    endDate = new Date(endOfDay)
  }
  
  return { startDate, endDate }
}

// Helper function to get date labels based on period
const getDateLabels = (period) => {
  const labels = []
  const now = new Date()
  
  if (period === 'week') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayOfWeek = now.getDay()
    for (let i = 0; i < 7; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - dayOfWeek + i)
      labels.push(days[date.getDay()])
    }
  } else if (period === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    for (let i = 1; i <= Math.min(daysInMonth, 14); i++) {
      labels.push(`${i}`)
    }
  } else if (period === 'year') {
    const months = ['Ja', 'Fe', 'Ma', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De']
    for (let i = 0; i < 12; i++) {
      labels.push(months[i])
    }
  }
  
  return labels
}

exports.applyAsSeller = async (req, res) => {
  try {
    const { shopName, ownerName, phone, address, businessType } = req.body
    
    // Check if seller already exists for this user
    const existingSeller = await Seller.findOne({ userId: req.user._id })
    if (existingSeller) {
      return res.status(400).json({ success: false, message: 'You have already applied to become a seller.' })
    }

    let shopLogoUrl = ''
    let idProofUrl = ''

    if (req.files) {
      if (req.files.shopLogo && req.files.shopLogo.length > 0) {
        shopLogoUrl = getFileUrl(req, req.files.shopLogo[0])
      }
      if (req.files.idProof && req.files.idProof.length > 0) {
        idProofUrl = getFileUrl(req, req.files.idProof[0])
      }
    }

    const seller = new Seller({
      userId: req.user._id,
      shopName,
      ownerName,
      email: req.user.email,
      phone,
      address: {
        street: address // storing full address in street for simplicity
      },
      businessType,
      shopLogo: shopLogoUrl,
      idProof: idProofUrl,
      status: 'pending'
    })

    await seller.save()

    // Optionally update user role to seller
    // await User.findByIdAndUpdate(req.user._id, { role: 'seller' })

    res.status(201).json({
      success: true,
      message: 'Seller application submitted successfully',
      seller
    })
  } catch (error) {
    console.error('Apply seller error:', error)
    res.status(500).json({ success: false, message: 'Server error while applying for seller' })
  }
}

// Get seller profile
exports.getSellerProfile = async (req, res) => {
  try {
    let seller = await Seller.findOne({ userId: req.user._id, status: 'approved' }).populate('userId', 'name email avatar location')
    if (!seller) {
      seller = await Seller.findOne({ userId: req.user._id }).sort({ createdAt: -1 }).populate('userId', 'name email avatar location')
    }
    if (!seller) {
      return res.json({ success: true, seller: null })
    }
    res.json({ success: true, seller })
  } catch (error) {
    console.error('Get seller profile error:', error)
    res.status(500).json({ success: false, message: 'Server error fetching seller profile' })
  }
}

// Get dashboard stats for seller
exports.getDashboardStats = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id, status: 'approved' })
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' })
    }

    const { period = 'month' } = req.query
    const { startDate, endDate } = getDateRange(period)

    // Total revenue for period
    const revenueData = await Order.aggregate([
      {
        $match: {
          sellerId: seller._id,
          createdAt: { $gte: startDate, $lte: endDate },
          orderStatus: { $in: ['shipped', 'delivered', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$sellerEarnings' },
          count: { $sum: 1 }
        }
      }
    ])

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0
    const totalOrders = revenueData.length > 0 ? revenueData[0].count : 0

    // Total products
    const totalProducts = await Product.countDocuments({ sellerId: seller._id })

    // Pending orders
    const pendingOrders = await Order.countDocuments({
      sellerId: seller._id,
      orderStatus: { $in: ['placed', 'confirmed', 'packed'] }
    })

    // Calculate trend (previous period comparison)
    let previousStartDate, previousEndDate
    const now = new Date()
    
    if (period === 'week') {
      const dayOfWeek = new Date(startDate).getDay()
      previousEndDate = new Date(startDate)
      previousStartDate = new Date(previousEndDate)
      previousStartDate.setDate(previousStartDate.getDate() - 7)
    } else if (period === 'month') {
      previousEndDate = new Date(startDate)
      previousStartDate = new Date(previousEndDate)
      previousStartDate.setMonth(previousStartDate.getMonth() - 1)
    } else {
      previousEndDate = new Date(startDate)
      previousStartDate = new Date(previousEndDate)
      previousStartDate.setFullYear(previousStartDate.getFullYear() - 1)
    }

    const prevRevenueData = await Order.aggregate([
      {
        $match: {
          sellerId: seller._id,
          createdAt: { $gte: previousStartDate, $lte: previousEndDate },
          orderStatus: { $in: ['shipped', 'delivered', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$sellerEarnings' }
        }
      }
    ])

    const previousRevenue = prevRevenueData.length > 0 ? prevRevenueData[0].totalRevenue : 1
    const revenueTrend = ((totalRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)

    res.json({
      success: true,
      stats: {
        revenue: `$${(totalRevenue / 1000).toFixed(1)}k`,
        revenueValue: totalRevenue,
        products: totalProducts,
        orders: totalOrders,
        pending: pendingOrders,
        trend: {
          revenue: { text: `${revenueTrend > 0 ? '+' : ''}${revenueTrend}%`, positive: revenueTrend > 0 },
          products: { text: '+0%', positive: true },
          orders: { text: `${((totalOrders > 0) ? '+5%' : '-2%')}`, positive: true },
          pending: { text: '-1.2%', positive: false }
        }
      }
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    res.status(500).json({ success: false, message: 'Server error fetching stats' })
  }
}

// Get earnings analytics
exports.getEarnings = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id, status: 'approved' })
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' })
    }

    const { period = 'month' } = req.query
    const labels = getDateLabels(period)
    const { startDate, endDate } = getDateRange(period)

    let values = []
    
    if (period === 'week') {
      // Get revenue for each day of the week
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(startDate)
        dayStart.setDate(dayStart.getDate() + i)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)

        const dayRevenue = await Order.aggregate([
          {
            $match: {
              sellerId: seller._id,
              createdAt: { $gte: dayStart, $lte: dayEnd },
              orderStatus: { $in: ['shipped', 'delivered', 'confirmed'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$sellerEarnings' }
            }
          }
        ])

        values.push(dayRevenue.length > 0 ? Math.round(dayRevenue[0].total) : 0)
      }
    } else if (period === 'month') {
      // Get revenue for each day of month (showing 14 days for cleaner view)
      const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate()
      const maxDays = Math.min(daysInMonth, 14)
      
      for (let i = 1; i <= maxDays; i++) {
        const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), i)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)

        const dayRevenue = await Order.aggregate([
          {
            $match: {
              sellerId: seller._id,
              createdAt: { $gte: dayStart, $lte: dayEnd },
              orderStatus: { $in: ['shipped', 'delivered', 'confirmed'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$sellerEarnings' }
            }
          }
        ])

        values.push(dayRevenue.length > 0 ? Math.round(dayRevenue[0].total) : 0)
      }
    } else if (period === 'year') {
      // Get revenue for each month
      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(endDate.getFullYear(), i, 1)
        const monthEnd = new Date(endDate.getFullYear(), i + 1, 0, 23, 59, 59, 999)

        const monthRevenue = await Order.aggregate([
          {
            $match: {
              sellerId: seller._id,
              createdAt: { $gte: monthStart, $lte: monthEnd },
              orderStatus: { $in: ['shipped', 'delivered', 'confirmed'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$sellerEarnings' }
            }
          }
        ])

        values.push(monthRevenue.length > 0 ? Math.round(monthRevenue[0].total) : 0)
      }
    }

    res.json({
      success: true,
      earnings: {
        labels,
        values
      }
    })
  } catch (error) {
    console.error('Get earnings error:', error)
    res.status(500).json({ success: false, message: 'Server error fetching earnings' })
  }
}

// Get recent orders
exports.getRecentOrders = async (req, res) => {
  try {
    const seller = await Seller.findOne({ userId: req.user._id, status: 'approved' })
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' })
    }

    const { period = 'month' } = req.query
    const { startDate, endDate } = getDateRange(period)

    const orders = await Order.find({
      sellerId: seller._id,
      createdAt: { $gte: startDate, $lte: endDate }
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()

    const recentOrders = orders.map(order => ({
      id: `#UBS-${String(order._id).slice(-5).toUpperCase()}`,
      product: order.items?.[0]?.productName || 'Product',
      customer: 'Customer',
      amount: `$${(order.sellerEarnings || order.grandTotal || 0).toFixed(2)}`,
      status: order.orderStatus.charAt(0).toUpperCase() + order.orderStatus.slice(1)
    }))

    res.json({
      success: true,
      orders: recentOrders
    })
  } catch (error) {
    console.error('Get recent orders error:', error)
    res.status(500).json({ success: false, message: 'Server error fetching orders' })
  }
}

// Update seller profile
exports.updateSellerProfile = async (req, res) => {
  try {
    let seller = await Seller.findOne({ userId: req.user._id })
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller profile not found' })
    }

    const { shopName, description, phone, address, businessType } = req.body

    if (shopName !== undefined) seller.shopName = shopName
    if (description !== undefined) seller.description = description
    if (phone !== undefined) seller.phone = phone
    if (businessType !== undefined) seller.businessType = businessType
    if (address !== undefined) {
      if (typeof address === 'object') {
        seller.address = {
          ...seller.address,
          ...address
        }
      } else {
        seller.address.street = address
      }
    }

    await seller.save()

    res.json({
      success: true,
      message: 'Seller profile updated successfully',
      seller
    })
  } catch (error) {
    console.error('Update seller profile error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}


