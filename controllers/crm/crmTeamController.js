const CRMStaff = require('../../models/CRMStaff')
const CRMAuditLog = require('../../models/CRMAuditLog')

exports.getTeamMembers = async (req, res) => {
  try {
    const members = await CRMStaff.find().select('-password').sort({ createdAt: -1 })
    res.status(200).json({
      success: true,
      members
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.createTeamMember = async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body

    const existing = await CRMStaff.findOne({ email: email.toLowerCase() })
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A CRM staff member with this email already exists'
      })
    }

    const staff = await CRMStaff.create({
      name,
      email,
      password,
      role: role || 'SALES_AGENT',
      department: department || 'Sales',
      phone: phone || ''
    })

    await CRMAuditLog.create({
      staffId: req.crmStaff?._id,
      staffName: req.crmStaff?.name,
      role: req.crmStaff?.role,
      action: 'STAFF_CREATED',
      targetEntity: 'CRMStaff',
      targetId: staff._id.toString(),
      details: { newStaffEmail: staff.email, role: staff.role }
    })

    const staffData = staff.toObject()
    delete staffData.password

    res.status(201).json({
      success: true,
      member: staffData
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

exports.updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params
    const { name, role, department, status, phone } = req.body

    const staff = await CRMStaff.findById(id)
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      })
    }

    if (name) staff.name = name
    if (role) staff.role = role
    if (department) staff.department = department
    if (status) staff.status = status
    if (phone !== undefined) staff.phone = phone

    if (req.body.password) {
      staff.password = req.body.password
    }

    await staff.save()

    const updated = staff.toObject()
    delete updated.password

    res.status(200).json({
      success: true,
      member: updated
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
