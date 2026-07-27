import express from 'express'

import twilio from 'twilio'
import { requireAuth } from '../auth/authMiddleware.js'
import db from '../db.js'
import {
  TWILIO_SID,
  TWILIO_TOKEN,
  TWILIO_FROM
} from '../config.js'
import { deliverEmail, emailEnabled } from '../utils/email.js'

const router = express.Router()

const upsertSecurityStmt = db.prepare(`
  INSERT INTO user_security (user_id, email_verified, phone_verified, email_code, phone_code, email_expires_at, phone_expires_at, phone_number)
  VALUES (?, 0, 0, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT(user_id) DO NOTHING
`)

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function expireMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

const smsEnabled = Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM)

const twilioClient = smsEnabled ? twilio(TWILIO_SID, TWILIO_TOKEN) : null

async function deliverSms(to, code) {
  if (!smsEnabled || !twilioClient) return { delivered: false, reason: 'sms not configured' }
  const msg = await twilioClient.messages.create({
    body: `Your verification code is ${code}`,
    from: TWILIO_FROM,
    to
  })
  return { delivered: true, sid: msg.sid }
}

router.use(requireAuth)

router.get('/status', (req, res) => {
  upsertSecurityStmt.run(req.user.id)
  const row = db.prepare('SELECT email_verified, phone_verified, phone_number FROM user_security WHERE user_id = ?').get(req.user.id)
  res.json(row || { email_verified: 0, phone_verified: 0, phone_number: null })
})

router.post('/email/send', async (req, res) => {
  upsertSecurityStmt.run(req.user.id)
  const code = generateCode()
  const expires = expireMinutes(10)
  db.prepare('UPDATE user_security SET email_code = ?, email_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(code, expires, req.user.id)
  let delivered = false
  try {
    const email = req.user.email
    if (email) {
      const result = await deliverEmail(email, code)
      delivered = result.delivered
      if (!delivered) console.log(`[SECURITY] Email OTP fallback: ${result.reason}`)
    }
  } catch (err) {
    console.log('[SECURITY] Email send error', err)
  }
  if (!delivered) {
    console.log(`[SECURITY] Email OTP for user ${req.user.id}: ${code} (expires ${expires})`)
    return res.json({ ok: true, expires_at: expires, info: 'Email service not configured; code logged server-side.' })
  }
  res.json({ ok: true, expires_at: expires, info: 'Email sent' })
})

router.post('/email/verify', (req, res) => {
  const { code } = req.body || {}
  if (!code) return res.status(400).json({ error: 'code required' })
  const row = db.prepare('SELECT email_code, email_expires_at FROM user_security WHERE user_id = ?').get(req.user.id)
  if (!row || !row.email_code) return res.status(400).json({ error: 'No code sent' })
  if (row.email_code !== code) return res.status(400).json({ error: 'Invalid code' })
  if (row.email_expires_at && new Date(row.email_expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired' })
  db.prepare('UPDATE user_security SET email_verified = 1, email_code = NULL, email_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(req.user.id)
  res.json({ ok: true })
})

router.post('/phone/send', async (req, res) => {
  const { phone } = req.body || {}
  if (!phone) return res.status(400).json({ error: 'phone required' })
  upsertSecurityStmt.run(req.user.id)
  const code = generateCode()
  const expires = expireMinutes(10)
  db.prepare('UPDATE user_security SET phone_code = ?, phone_expires_at = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(code, expires, phone, req.user.id)
  let delivered = false
  try {
    const result = await deliverSms(phone, code)
    delivered = result.delivered
    if (!delivered) console.log(`[SECURITY] SMS OTP fallback: ${result.reason}`)
  } catch (err) {
    console.log('[SECURITY] SMS send error', err)
  }
  if (!delivered) {
    console.log(`[SECURITY] Phone OTP for user ${req.user.id}: ${code} (expires ${expires}) phone=${phone}`)
    return res.json({ ok: true, expires_at: expires, info: 'SMS service not configured; code logged server-side.' })
  }
  res.json({ ok: true, expires_at: expires, info: 'SMS sent' })
})

router.post('/phone/verify', (req, res) => {
  const { code } = req.body || {}
  if (!code) return res.status(400).json({ error: 'code required' })
  const row = db.prepare('SELECT phone_code, phone_expires_at FROM user_security WHERE user_id = ?').get(req.user.id)
  if (!row || !row.phone_code) return res.status(400).json({ error: 'No code sent' })
  if (row.phone_code !== code) return res.status(400).json({ error: 'Invalid code' })
  if (row.phone_expires_at && new Date(row.phone_expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired' })
  db.prepare('UPDATE user_security SET phone_verified = 1, phone_code = NULL, phone_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(req.user.id)
  res.json({ ok: true })
})

export default router
