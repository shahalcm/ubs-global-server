const CRMFollowUp = require('../../models/CRMFollowUp')
const CRMActivity = require('../../models/CRMActivity')

exports.getFollowUps = async (req, res) => {
  try {
    const { status, timeframe, assignedTo, priority } = req.query
    const query = {}

    const now = new Date()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    if (timeframe === 'today') {
      query.dueDate = { $gte: startOfToday, $lte: endOfToday }
    } else if (timeframe === 'upcoming') {
      query.dueDate = { $gt: endOfToday }
      query.status = 'PENDING'
    } else if (timeframe === 'overdue') {
      query.dueDate = { $lt: startOfToday }
      query.status = 'PENDING'
    }

    if (status) query.status = status
    if (priority) query.priority = priority
    if (assignedTo) query.assignedTo = assignedTo

    const followups = await CRMFollowUp.find(query)
      .populate('assignedTo', 'name avatar email role')
      .sort({ dueDate: 1 })

    res.status(200).json({
      success: true,
      followups,
      count: followups.length
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createFollowUp = async (req, res) => {
  try {
    const followup = await CRMFollowUp.create({
      ...req.body,
      createdBy: req.crmStaff?._id,
      assignedTo: req.body.assignedTo || req.crmStaff?._id
    })

    await CRMActivity.create({
      entityType: followup.entityType,
      entityId: followup.entityId,
      action: 'FOLLOWUP_CREATED',
      description: `Follow-up "${followup.title}" scheduled for ${new Date(followup.dueDate).toLocaleDateString()}`,
      performedBy: req.crmStaff?._id,
      performedByName: req.crmStaff?.name
    })

    res.status(201).json({
      success: true,
      followup
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateFollowUp = async (req, res) => {
  try {
    const { id } = req.params
    const { status, completionNotes } = req.body

    const updateData = { ...req.body }
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date()
    }

    const followup = await CRMFollowUp.findByIdAndUpdate(id, updateData, { new: true })
      .populate('assignedTo', 'name avatar email role')

    if (!followup) {
      return res.status(404).json({
        success: false,
        message: 'Follow-up not found'
      })
    }

    res.status(200).json({
      success: true,
      followup
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.deleteFollowUp = async (req, res) => {
  try {
    const { id } = req.params
    await CRMFollowUp.findByIdAndDelete(id)
    res.status(200).json({
      success: true,
      message: 'Follow-up deleted'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
