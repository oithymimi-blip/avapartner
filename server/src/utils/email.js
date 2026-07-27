import nodemailer from 'nodemailer'
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } from '../config.js'

export const emailEnabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)

const mailTransport = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT || 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null

export async function deliverEmail(to, code) {
  if (!emailEnabled || !mailTransport) return { delivered: false, reason: 'email not configured', devCode: code }
  try {
    const info = await mailTransport.sendMail({
      from: SMTP_USER,
      to,
      subject: 'Your verification code',
      text: `Your verification code is ${code}`,
      html: `<p>Your verification code is <b>${code}</b></p>`
    })
    return { delivered: true, messageId: info.messageId }
  } catch (err) {
    console.error('[EMAIL] Send error', err)
    return { delivered: false, reason: err.message, devCode: code }
  }
}

export async function deliverPasswordResetEmail(to, resetLink) {
  if (!emailEnabled || !mailTransport) {
    return { delivered: false, reason: 'email not configured', devLink: resetLink }
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0e11; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e0e6ed;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0e11; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:540px; background-color:#161a1e; border-radius:16px; border:1px solid #2a2e39; overflow:hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px; text-align: center; border-bottom: 1px solid #2a2e39; background: linear-gradient(135deg, #161a1e 0%, #1e2329 100%);">
              <div style="font-size: 24px; font-weight: 800; color: #00f2fe; letter-spacing: 1px;">
                <span style="color: #00f2fe;">AvaPartner</span>
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 36px 30px;">
              <h2 style="margin:0 0 16px 0; font-size:22px; color:#ffffff; font-weight:700;">Password Reset Request</h2>
              <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#9fa6b2;">
                We received a request to reset the password associated with your account. Click the button below to choose a new password:
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background: linear-gradient(90deg, #00f2fe 0%, #4facfe 100%); color: #000000; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 242, 254, 0.3);">
                  Reset Password
                </a>
              </div>
              <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#6c757d;">
                If the button above does not work, copy and paste the following link into your web browser:
              </p>
              <div style="word-break: break-all; font-size:12px; color:#00f2fe; background:#0b0e11; padding:12px; border-radius:6px; border:1px solid #2a2e39; margin-bottom:24px;">
                <a href="${resetLink}" style="color:#00f2fe; text-decoration:none;">${resetLink}</a>
              </div>
              <hr style="border:none; border-top:1px solid #2a2e39; margin:24px 0;" />
              <p style="margin:0; font-size:12px; line-height:1.5; color:#8c9199;">
                🔒 <strong>Security Note:</strong> This password reset link will expire in <strong>30 minutes</strong>. If you did not request a password reset, please ignore this email and your password will remain unchanged.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color:#0e1114; text-align: center; border-top: 1px solid #2a2e39; font-size: 12px; color: #6c757d;">
              © ${new Date().getFullYear()} AvaPartner. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  const textContent = `Password Reset Request

We received a request to reset your password. Please click the following link to set a new password:

${resetLink}

This link will expire in 30 minutes. If you did not request this, please ignore this email.
`

  try {
    const info = await mailTransport.sendMail({
      from: SMTP_USER,
      to,
      subject: 'Reset Your Password - AvaPartner',
      text: textContent,
      html: htmlContent
    })
    return { delivered: true, messageId: info.messageId }
  } catch (err) {
    console.error('[EMAIL] Reset password send error:', err)
    return { delivered: false, reason: err.message, devLink: resetLink }
  }
}

