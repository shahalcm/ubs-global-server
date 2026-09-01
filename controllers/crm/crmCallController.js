const Call = require('../../models/Call')
const CallHistory = require('../../models/CallHistory')
const SupportCall = require('../../models/SupportCall')

exports.getCallHistory = async (req, res) => {
  try {
    const { status, search } = req.query

    // Fetch call history records
    const calls = await CallHistory.find()
      .populate('caller', 'name email phone avatar')
      .populate('receiver', 'name email phone avatar')
      .sort({ createdAt: -1 })
      .limit(50)

    const supportCalls = await SupportCall.find()
      .populate('user', 'name email phone avatar')
      .sort({ createdAt: -1 })
      .limit(50)

    res.status(200).json({
      success: true,
      calls,
      supportCalls
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
