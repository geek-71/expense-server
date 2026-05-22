/**
 * Attach these to routes that require authentication.
 *
 * Session shape set by POST /api/auth/login:
 *   { role: 'member', memberId: string, memberName: string }
 *   { role: 'captain' }
 */

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Not authenticated. Please log in first.' })
  }
  next()
}

function requireCaptain(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'captain') {
    return res.status(403).json({ error: 'Captain access required.' })
  }
  next()
}

/**
 * requireMemberOrCaptain — the requesting user must be either:
 *   - the captain, OR
 *   - the member whose :memberId param matches their session
 *
 * Use this on routes like GET /api/transactions/:memberId
 */
function requireMemberOrCaptain(req, res, next) {
  const user = req.session?.user
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' })
  }
  if (user.role === 'captain') return next()
  if (user.role === 'member' && user.memberId === req.params.memberId) return next()
  return res.status(403).json({ error: 'Access denied.' })
}

module.exports = { requireAuth, requireCaptain, requireMemberOrCaptain }
