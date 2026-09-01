const CRMSupportTicket = require('../../models/CRMSupportTicket')
const CRMActivity = require('../../models/CRMActivity')

exports.getTickets = async (req, res) => {
  try {
    const { status, category, priority, assignedTo, search } = req.query
    const query = {}

    if (search) {
      query.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { requesterName: { $regex: search, $options: 'i' } },
        { requesterEmail: { $regex: search, $options: 'i' } }
      ]
    }

    if (status) query.status = status
    if (category) query.category = category
    if (priority) query.priority = priority
    if (assignedTo) query.assignedTo = assignedTo

    const tickets = await CRMSupportTicket.find(query)
      .populate('customer', 'name email avatar phone')
      .populate('seller', 'shopName ownerName email')
      .populate('assignedTo', 'name avatar role')
      .sort({ updatedAt: -1 })

    res.status(200).json({
      success: true,
      tickets,
      count: tickets.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createTicket = async (req, res) => {
  try {
    const ticket = await CRMSupportTicket.create({
      ...req.body,
      assignedTo: req.body.assignedTo || req.crmStaff?._id
    })

    res.status(201).json({
      success: true,
      ticket
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params
    const ticket = await CRMSupportTicket.findById(id)
      .populate('customer', 'name email avatar phone countryName')
      .populate('seller', 'shopName ownerName email phone')
      .populate('assignedTo', 'name avatar role department')

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      })
    }

    res.status(200).json({
      success: true,
      ticket
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params
    const { status, priority, category, assignedTo, message } = req.body

    const ticket = await CRMSupportTicket.findById(id)
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      })
    }

    if (status) ticket.status = status
    if (priority) ticket.priority = priority
    if (category) ticket.category = category
    if (assignedTo) ticket.assignedTo = assignedTo

    if (message) {
      ticket.messages.push({
        senderType: 'STAFF',
        senderName: req.crmStaff?.name || 'CRM Agent',
        senderId: req.crmStaff?._id,
        message,
        isInternal: req.body.isInternal || false
      })
    }

    if (status === 'RESOLVED') ticket.resolvedAt = new Date()
    if (status === 'CLOSED') ticket.closedAt = new Date()

    await ticket.save()

    const updatedTicket = await CRMSupportTicket.findById(id)
      .populate('customer', 'name email avatar phone')
      .populate('seller', 'shopName ownerName email')
      .populate('assignedTo', 'name avatar role')

    res.status(200).json({
      success: true,
      ticket: updatedTicket
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
