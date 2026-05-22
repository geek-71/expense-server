const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db = require('../db')
const { requireCaptain, requireMemberOrCaptain } = require('../middleware/auth')

function getApprovedBalance(memberId) {
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

/**
 * GET /api/transactions
 * Captain only. All transactions, optional ?search=
 */
router.get('/', requireCaptain, (req, res) => {
  const { search } = req.query
  let txs
  if (search) {
    const like = `%${search}%`
    txs = db.all(
      `SELECT * FROM transactions
       WHERE note LIKE ? OR memberName LIKE ? OR CAST(amount AS TEXT) LIKE ?
       ORDER BY createdAt DESC`,
      [like, like, like]
    )
  } else {
    txs = db.all('SELECT * FROM transactions ORDER BY createdAt DESC')
  }
  res.json(txs)
})

/**
 * GET /api/transactions/:memberId
 * Member (own) or captain. Optional ?search=
 */
router.get('/:memberId', requireMemberOrCaptain, (req, res) => {
  const { memberId } = req.params
  const { search } = req.query
  let txs
  if (search) {
    const like = `%${search}%`
    txs = db.all(
      `SELECT * FROM transactions
       WHERE memberId = ? AND (note LIKE ? OR CAST(amount AS TEXT) LIKE ?)
       ORDER BY createdAt DESC`,
      [memberId, like, like]
    )
  } else {
    txs = db.all(
      'SELECT * FROM transactions WHERE memberId = ? ORDER BY createdAt DESC',
      [memberId]
    )
  }
  const balance = getApprovedBalance(memberId)
  res.json({ transactions: txs, balance })
})

/**
 * POST /api/transactions
 * Members: submit credit/debit (pending).
 * Captain: directly credit/debit any member (auto-approved).
 */
router.post('/', (req, res) => {
  const user = req.session?.user
  if (!user) return res.status(401).json({ error: 'Not authenticated.' })

  const { memberId, type, amount, note } = req.body
  const amt = parseFloat(amount)

  if (!memberId) return res.status(400).json({ error: 'memberId is required.' })
  if (!['credit', 'debit'].includes(type)) return res.status(400).json({ error: 'type must be "credit" or "debit".' })
  if (!amt || amt <= 0 || isNaN(amt)) return res.status(400).json({ error: 'amount must be a positive number.' })

  if (user.role === 'member' && user.memberId !== memberId) {
    return res.status(403).json({ error: 'You can only submit transactions for your own account.' })
  }

  const member = db.get('SELECT * FROM members WHERE id = ?', [memberId])
  if (!member) return res.status(404).json({ error: 'Member not found.' })

  const isCaptain = user.role === 'captain'
  const status = isCaptain ? 'approved' : 'pending'
  const initiatedBy = isCaptain ? 'captain' : 'self'

  // Debit block — runs for both members and captain
  if (type === 'debit') {
    const { balance } = getApprovedBalance(memberId)
    if (amt >= balance) {
      return res.status(422).json({
        error: `Debit blocked: ${member.name}'s balance is ₹${balance.toFixed(2)}. Debiting ₹${amt.toFixed(2)} would reach zero or go negative.`,
        currentBalance: balance,
      })
    }
  }

  const id = uuidv4()
  const createdAt = new Date().toISOString()
  db.run(
    `INSERT INTO transactions (id, memberId, memberName, type, amount, note, status, initiatedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, memberId, member.name, type, amt, note?.trim() || null, status, initiatedBy, createdAt]
  )

  const tx = db.get('SELECT * FROM transactions WHERE id = ?', [id])
  res.status(201).json(tx)
})

/**
 * PATCH /api/transactions/:id/decide
 * Captain only. Approve or reject a pending transaction.
 */
router.patch('/:id/decide', requireCaptain, (req, res) => {
  const { status } = req.body
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected".' })
  }

  const tx = db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id])
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' })
  if (tx.status !== 'pending') return res.status(409).json({ error: `Transaction is already ${tx.status}.` })

  // Re-run debit block at approval time
  if (status === 'approved' && tx.type === 'debit') {
    const { balance } = getApprovedBalance(tx.memberId)
    const amt = parseFloat(tx.amount)
    if (amt >= balance) {
      return res.status(422).json({
        error: `Cannot approve: ${tx.memberName}'s balance is ₹${balance.toFixed(2)}. Approving this debit would reach zero or go negative.`,
        currentBalance: balance,
      })
    }
  }

  db.run('UPDATE transactions SET status = ? WHERE id = ?', [status, req.params.id])
  const updated = db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id])
  res.json(updated)
})

module.exports = router
