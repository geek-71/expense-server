require('dotenv').config()
const express = require('express')
const session = require('express-session')
const cors = require('cors')

const errorHandler = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const memberRoutes = require('./routes/members')
const transactionRoutes = require('./routes/transactions')

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true,
}))


app.use(express.json())

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',  // 'none' for cross-domain
  secure: process.env.NODE_ENV === 'production',   // true on HTTPS, false locally
  maxAge: 1000 * 60 * 60 * 8,
}
}))

app.use('/api/auth', authRoutes)
app.use('/api/members', memberRoutes)
app.use('/api/transactions', transactionRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` })
})

app.use(errorHandler)

module.exports = app
