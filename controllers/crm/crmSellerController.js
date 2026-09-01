const Seller = require('../../models/Seller')
const Product = require('../../models/Product')
const Order = require('../../models/Order')
const CRMSupportTicket = require('../../models/CRMSupportTicket')
const CRMNote = require('../../models/CRMNote')
const CRMActivity = require('../../models/CRMActivity')

exports.getSellers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 15
    const skip = (page - 1) * limit
    const search = req.query.search || ''
    const status = req.query.status || ''
    const kycStatus = req.query.kycStatus || ''

    const query = {}

    if (search) {
      query.$or = [
        { shopName: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ]
    }

    if (status) {
      query.status = status
    }

    if (kycStatus) {
      query.kycStatus = kycStatus
    }

    const total = await Seller.countDocuments(query)
    const sellers = await Seller.find(query)
      .populate('userId', 'name email avatar phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      success: true,
      sellers,
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

exports.getSeller360 = async (req, res) => {
  try {
    const { id } = req.params
    const seller = await Seller.findById(id).populate('userId', 'name email avatar phone').lean()

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      })
    }

    // Products
    const productsCount = await Product.countDocuments({ sellerId: id })
    const recentProducts = await Product.find({ sellerId: id }).limit(10)

    // Orders & Financials
    const orders = await Order.find({ sellerId: id }).sort({ createdAt: -1 }).limit(20)

    const financialAgg = await Order.aggregate([
      { $match: { sellerId: seller._id, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          sellerEarnings: { $sum: '$sellerEarnings' },
          totalPaidOrders: { $sum: 1 }
        }
      }
    ])

    const metrics = {
      productsCount,
      totalRevenue: financialAgg[0]?.totalRevenue || 0,
      sellerEarnings: financialAgg[0]?.sellerEarnings || 0,
      totalPaidOrders: financialAgg[0]?.totalPaidOrders || 0,
      rating: seller.rating || 0,
      totalReviews: seller.totalReviews || 0
    }

    // Support tickets
    const tickets = await CRMSupportTicket.find({ seller: id }).sort({ createdAt: -1 })

    // Notes
    const notes = await CRMNote.find({ entityType: 'Seller', entityId: id })
      .populate('author', 'name avatar role')
      .sort({ createdAt: -1 })

    // Activity
    const activities = await CRMActivity.find({ entityType: 'Seller', entityId: id })
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      seller: {
        ...seller,
        metrics
      },
      recentProducts,
      orders,
      tickets,
      notes,
      activities
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateSellerStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, kycStatus, adminNote } = req.body

    const seller = await Seller.findById(id)
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      })
    }

    if (status) seller.status = status
    if (kycStatus) seller.kycStatus = kycStatus
    if (adminNote) seller.adminNote = adminNote

    await seller.save()

    await CRMActivity.create({
      entityType: 'Seller',
      entityId: seller._id,
      action: 'STATUS_UPDATE',
      description: `Seller status updated to ${status || seller.status}, KYC: ${kycStatus || seller.kycStatus}`,
      performedBy: req.crmStaff?._id,
      performedByName: req.crmStaff?.name
    })

    res.status(200).json({
      success: true,
      seller
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
