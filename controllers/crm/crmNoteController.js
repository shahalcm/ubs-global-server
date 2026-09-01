const CRMNote = require('../../models/CRMNote')
const CRMActivity = require('../../models/CRMActivity')

exports.getNotes = async (req, res) => {
  try {
    const { entityType, entityId } = req.query
    const query = {}
    if (entityType) query.entityType = entityType
    if (entityId) query.entityId = entityId

    const notes = await CRMNote.find(query)
      .populate('author', 'name avatar role')
      .sort({ createdAt: -1 })

    res.status(200).json({
      success: true,
      notes
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createNote = async (req, res) => {
  try {
    const note = await CRMNote.create({
      ...req.body,
      author: req.crmStaff?._id
    })

    const populatedNote = await CRMNote.findById(note._id).populate('author', 'name avatar role')

    await CRMActivity.create({
      entityType: note.entityType,
      entityId: note.entityId,
      action: 'NOTE_ADDED',
      description: `Internal note added: "${note.content.substring(0, 40)}..."`,
      performedBy: req.crmStaff?._id,
      performedByName: req.crmStaff?.name
    })

    res.status(201).json({
      success: true,
      note: populatedNote
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.deleteNote = async (req, res) => {
  try {
    const { id } = req.params
    await CRMNote.findByIdAndDelete(id)
    res.status(200).json({
      success: true,
      message: 'Note deleted'
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
