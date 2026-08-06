const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

exports.sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_USER === 'your_email@gmail.com') {
    console.log('ℹ️ [Email] EMAIL_USER / EMAIL_PASS not configured in environment, skipping email alert.')
    return
  }

  try {
    await Promise.race([
      transporter.sendMail({
        from: `"UBS Global" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email dispatch timeout')), 4000))
    ])
  } catch (error) {
    console.log('Email notice:', error.message)
  }
}