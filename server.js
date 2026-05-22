require('dotenv').config()
const app = require('./src/app')
const db = require('./src/db')

const PORT = process.env.PORT || 3001



async function start() {

  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('ERROR: SESSION_SECRET env var must be set in production.')
  process.exit(1)
  }
  
  try {
    console.log('\n  Initialising database...')
    await db.init()
    console.log('  ✓ Database ready.\n')

    app.listen(PORT, () => {
      console.log(`  Roommate Tracker API → http://localhost:${PORT}`)
      console.log(`  Health check        → http://localhost:${PORT}/api/health\n`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

start()
