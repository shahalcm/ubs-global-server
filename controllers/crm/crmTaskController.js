const CRMTask = require('../../models/CRMTask')

exports.getTasks = async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.query
    const query = {}

    if (status) query.status = status
    if (priority) query.priority = priority
    if (assignedTo) query.assignedTo = assignedTo

    const tasks = await CRMTask.find(query)
      .populate('assignedTo', 'name avatar email role')
      .populate('createdBy', 'name avatar')
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      tasks
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createTask = async (req, res) => {
  try {
    const task = await CRMTask.create({
      ...req.body,
      createdBy: req.crmStaff?._id,
      assignedTo: req.body.assignedTo || req.crmStaff?._id
    })

    res.status(201).json({
      success: true,
      task
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = { ...req.body }
    if (req.body.status === 'COMPLETED') {
      updateData.completedAt = new Date()
    }

    const task = await CRMTask.findByIdAndUpdate(id, updateData, { new: true })
      .populate('assignedTo', 'name avatar email role')

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      })
    }

    res.status(200).json({
      success: true,
      task
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params
    await CRMTask.findByIdAndDelete(id)
    res.status(200).json({
      success: true,
      message: 'Task deleted'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
