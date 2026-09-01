const CRMLead = require('../../models/CRMLead')
const CRMActivity = require('../../models/CRMActivity')
const CRMNote = require('../../models/CRMNote')
const CRMFollowUp = require('../../models/CRMFollowUp')

exports.getLeads = async (req, res) => {
  try {
    const { search, type, status, priority, assignedTo, format } = req.query

    const query = {}

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ]
    }

    if (type) query.type = type
    if (status) query.status = status
    if (priority) query.priority = priority
    if (assignedTo) query.assignedTo = assignedTo

    const leads = await CRMLead.find(query)
      .populate('assignedTo', 'name avatar email role')
      .sort({ updatedAt: -1 })

    // If format=kanban is requested, return leads grouped by pipeline status
    if (format === 'kanban') {
      const statuses = ['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'CONVERTED', 'NOT_INTERESTED', 'LOST']
      const kanbanData = {}
      statuses.forEach(st => {
        kanbanData[st] = leads.filter(l => l.status === st)
      })

      return res.status(200).json({
        success: true,
        kanban: kanbanData,
        total: leads.length
      })
    }

    res.status(200).json({
      success: true,
      leads,
      total: leads.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createLead = async (req, res) => {
  try {
    const lead = await CRMLead.create({
      ...req.body,
      assignedTo: req.body.assignedTo || req.crmStaff?._id
    })

    await CRMActivity.create({
      entityType: 'Lead',
      entityId: lead._id,
      action: 'LEAD_CREATED',
      description: `New lead "${lead.name}" created with status ${lead.status}`,
      performedBy: req.crmStaff?._id,
      performedByName: req.crmStaff?.name
    })

    res.status(201).json({
      success: true,
      lead
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params
    const lead = await CRMLead.findById(id).populate('assignedTo', 'name avatar email role').lean()

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      })
    }

    const notes = await CRMNote.find({ entityType: 'Lead', entityId: id })
      .populate('author', 'name avatar role')
      .sort({ createdAt: -1 })

    const followups = await CRMFollowUp.find({ entityType: 'Lead', entityId: id })
      .populate('assignedTo', 'name avatar')
      .sort({ dueDate: -1 })

    const activities = await CRMActivity.find({ entityType: 'Lead', entityId: id })
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      lead,
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

exports.updateLead = async (req, res) => {
  try {
    const { id } = req.params
    const oldLead = await CRMLead.findById(id)

    if (!oldLead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      })
    }

    const lead = await CRMLead.findByIdAndUpdate(id, req.body, { new: true })
      .populate('assignedTo', 'name avatar email role')

    if (oldLead.status !== lead.status) {
      await CRMActivity.create({
        entityType: 'Lead',
        entityId: lead._id,
        action: 'LEAD_STATUS_CHANGED',
        description: `Lead status changed from ${oldLead.status} to ${lead.status}`,
        performedBy: req.crmStaff?._id,
        performedByName: req.crmStaff?.name
      })
    }

    res.status(200).json({
      success: true,
      lead
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params
    const lead = await CRMLead.findByIdAndDelete(id)

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      })
    }

    res.status(200).json({
      success: true,
      message: 'Lead successfully deleted'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
