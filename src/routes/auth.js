const router = require('express').Router()
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

/**
 * POST /api/auth/login
 * Body: { role: 'captain', pin }
 *       { role: 'member', memberId, pin }
 */
router.post('/login', (req, res) => {
  const { role, memberId, pin } = req.body

  if (!role || !pin) {
    return res.status(400).json({ error: 'role and pin are required.' })
  }

  if (role === 'captain') {
    const setting = db.get('SELECT value FROM settings WHERE key = ?', ['captainPin'])
    if (!setting || setting.value !== pin) {
      return res.status(401).json({ error: 'Incorrect PIN.' })
    }
    req.session.user = { role: 'captain' }
    return res.json({ role: 'captain' })
  }

  if (role === 'member') {
    if (!memberId) return res.status(400).json({ error: 'memberId is required.' })
    const member = db.get('SELECT * FROM members WHERE id = ?', [memberId])
    if (!member) return res.status(404).json({ error: 'Member not found.' })
    if (member.pin !== pin) return res.status(401).json({ error: 'Incorrect PIN.' })
    req.session.user = { role: 'member', memberId: member.id, memberName: member.name }
    return res.json({ role: 'member', memberId: member.id, memberName: member.name })
  }

  return res.status(400).json({ error: 'role must be "member" or "captain".' })
})

/** POST /api/auth/logout */
router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err)
    res.clearCookie('connect.sid')
    res.json({ message: 'Logged out.' })
  })
})

/** GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  res.json(req.session.user)
})

module.exports = router
