require('dotenv').config()
const express = require('express')
const session = require('express-session')
const cors = require('cors')

const errorHandler = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const memberRoutes = require('./routes/members')
const transactionRoutes = require('./routes/transactions')

const path = require('path')

const app = express()

app.use(cors({
  // origin: process.env.FRONTEND_ORIGIN,
   origin: (origin, callback) => callback(null, origin ?? true),
  credentials: true,
}))


app.use(express.json())

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
  httpOnly: true,
  sameSite: 'lax',  // 'none' for cross-domain
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
// Remove all CORS config — not needed on same domain

// After all /api routes, serve the React app
const publicDir = path.join(__dirname, '../public')
app.use(express.static(publicDir))

// All non-API routes return index.html (React Router handles them)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, '../public/index.html'))
})
app.use(errorHandler)

module.exports = app
