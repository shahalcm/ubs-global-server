const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

exports.sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"UBS Global" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    })
  } catch (error) {
    console.log('Email error:', error.message)
  }
}