const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db = require('../db')
const { requireCaptain } = require('../middleware/auth')

function getBalance(memberId) {
  const txs = db.all(
    'SELECT type, amount FROM transactions WHERE memberId = ? AND status = ?',
    [memberId, 'approved']
  )
  let credited = 0, debited = 0
  txs.forEach(t => {
    const amt = parseFloat(t.amount)
    if (t.type === 'credit') credited += amt
    else debited += amt
  })
  return { credited, debited, balance: credited - debited }
}

/** GET /api/members — captain only   requireCaptain */ 
router.get('/', (req, res) => {
  const members = db.all('SELECT * FROM members ORDER BY createdAt ASC')
  const enriched = members.map(m => ({ ...m, ...getBalance(m.id) }))
  res.json(enriched)
})

/** POST /api/members — captain only */
router.post('/', requireCaptain, (req, res) => {
  const { name, pin, colorIdx } = req.body

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' })
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'pin must be exactly 4 digits.' })
  if (colorIdx === undefined || colorIdx < 0 || colorIdx > 5) return res.status(400).json({ error: 'colorIdx must be 0–5.' })

  const existing = db.get('SELECT id FROM members WHERE pin = ?', [pin])
  if (existing) return res.status(409).json({ error: 'A member with that PIN already exists.' })

  const id = uuidv4()
  const createdAt = new Date().toISOString()
  db.run(
    'INSERT INTO members (id, name, pin, colorIdx, createdAt) VALUES (?, ?, ?, ?, ?)',
    [id, name.trim(), pin, colorIdx, createdAt]
  )

  const member = db.get('SELECT * FROM members WHERE id = ?', [id])
  res.status(201).json(member)
})

/** DELETE /api/members/:id — captain only */
router.delete('/:id', requireCaptain, (req, res) => {
  const member = db.get('SELECT * FROM members WHERE id = ?', [req.params.id])
  if (!member) return res.status(404).json({ error: 'Member not found.' })

  db.run('DELETE FROM members WHERE id = ?', [req.params.id])
  res.json({ message: `Member "${member.name}" removed. Their transaction history is preserved.` })
})

module.exports = router
