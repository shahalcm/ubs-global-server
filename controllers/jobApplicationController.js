const JobApplication = require('../models/JobApplication')
const Product = require('../models/Product')

exports.applyForJob = async (req, res) => {
  try {
    const { jobId, name, email, phone, experience, coverLetter } = req.body

    if (!jobId || !name || !email || !phone || !experience) {
      return res.status(400).json({
        success: false,
        message: 'Job ID, Name, Email, Phone, and Experience are required'
      })
    }

    const job = await Product.findById(jobId)
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job listing not found'
      })
    }

    let cvUrl = ''
    if (req.file) {
      if (req.file.path && (req.file.path.startsWith('http://') || req.file.path.startsWith('https://'))) {
        cvUrl = req.file.path
      } else {
        const host = req.get('host') || ''
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.') || host.includes('10.')
        const protocol = isLocal ? req.protocol : 'https'
        cvUrl = `${protocol}://${host}/uploads/resumes/${req.file.filename}`
      }
    }

    const application = await JobApplication.create({
      jobId,
      userId: req.user._id,
      name,
      email,
      phone,
      experience,
      coverLetter: coverLetter || '',
      cvUrl
    })

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      application
    })
  } catch (error) {
    console.error('Apply for job error:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
