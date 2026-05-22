# Roommate Tracker — Backend

REST API for the Roommate Tracker app. Built with **Node.js**, **Express**, and **SQLite** (via sql.js — no native compilation needed).

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env — at minimum change SESSION_SECRET in production

# 3. Start development server (auto-restarts on file change)
npm run dev

# 4. Or start production server
npm start
```

The API will be available at `http://localhost:3001`.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `SESSION_SECRET` | `dev-secret-...` | Secret for signing session cookies — **change in production** |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (Vite dev server) |

---

## Default Credentials

| Role | PIN |
|---|---|
| Captain | `0000` |

The captain PIN is stored in the `settings` table and seeded automatically on first run. Members are added by the captain after startup — there are no default members.

---

## Project Structure

```
roommate-tracker-backend/
├── server.js               # Entry point — inits DB, starts Express
├── .env                    # Environment variables (git-ignored)
├── .env.example            # Template to copy from
├── data/                   # Auto-created — holds roommate.sqlite
└── src/
    ├── app.js              # Express setup: CORS, sessions, routes, error handler
    ├── db/
    │   └── index.js        # sql.js wrapper — schema, persistence, query helpers
    ├── routes/
    │   ├── auth.js         # POST /api/auth/login|logout, GET /api/auth/me
    │   ├── members.js      # GET|POST /api/members, DELETE /api/members/:id
    │   └── transactions.js # GET|POST /api/transactions, PATCH /:id/decide
    └── middleware/
        ├── auth.js         # requireAuth, requireCaptain, requireMemberOrCaptain
        └── errorHandler.js # Global Express error handler
```

---

## API Reference

All routes are prefixed with `/api`. Session cookie (`connect.sid`) is set on login and must be sent with subsequent requests (browser does this automatically with `credentials: 'include'`).

### Auth

#### `POST /api/auth/login`

**Captain login:**
```json
{ "role": "captain", "pin": "0000" }
```
Response:
```json
{ "role": "captain" }
```

**Member login:**
```json
{ "role": "member", "memberId": "<uuid>", "pin": "1111" }
```
Response:
```json
{ "role": "member", "memberId": "<uuid>", "memberName": "Arjun" }
```

Errors: `400` (missing fields), `401` (wrong PIN), `404` (member not found)

---

#### `POST /api/auth/logout`
Requires: any valid session.
Destroys the session and clears the cookie.

---

#### `GET /api/auth/me`
Requires: any valid session.
Returns the current session user object.

---

### Members

All member routes require a **captain** session.

#### `GET /api/members`
Returns all members with their computed balances (approved transactions only).

```json
[
  {
    "id": "uuid",
    "name": "Arjun",
    "pin": "1111",
    "colorIdx": 0,
    "createdAt": "2026-05-20T10:00:00.000Z",
    "credited": 5000,
    "debited": 200,
    "balance": 4800
  }
]
```

#### `POST /api/members`
```json
{ "name": "Arjun", "pin": "1111", "colorIdx": 0 }
```
- `name`: 1–60 characters, required
- `pin`: exactly 4 digits, must be unique across all members
- `colorIdx`: integer 0–5 (maps to 6 avatar colour presets in the frontend)

Errors: `400` (validation), `409` (PIN already taken)

#### `DELETE /api/members/:id`
Removes the member. Their transactions are **preserved** in the database (the `memberName` column is a denormalised snapshot).

---

### Transactions

#### `GET /api/transactions`
Requires: **captain** session.
Returns all transactions across all members, newest first.

Query params:
- `?search=string` — filters by `note`, `memberName`, or `amount`

#### `GET /api/transactions/:memberId`
Requires: the **member themselves** or **captain**.
Returns that member's transactions plus their current approved balance.

```json
{
  "transactions": [ ... ],
  "balance": { "credited": 5000, "debited": 200, "balance": 4800 }
}
```

Query params:
- `?search=string` — filters by `note` or `amount`

#### `POST /api/transactions`

**By a member** (session role = `member`):
- Can only submit for their own `memberId`
- Transaction is created with `status: "pending"` and `initiatedBy: "self"`
- Awaits captain approval

**By captain** (session role = `captain`):
- Can submit for any member
- Transaction is created with `status: "approved"` and `initiatedBy: "captain"`
- No approval step needed

```json
{ "memberId": "<uuid>", "type": "credit", "amount": 5000, "note": "Rent contribution" }
```

**Debit block:** if `amount >= member's current approved balance`, the request is rejected with `422`:
```json
{
  "error": "Debit blocked: Arjun's balance is ₹5000.00. Debiting ₹5000.00 would reach zero or go negative.",
  "currentBalance": 5000
}
```

#### `PATCH /api/transactions/:id/decide`
Requires: **captain** session.
```json
{ "status": "approved" }
```
or
```json
{ "status": "rejected" }
```

- Only works on `pending` transactions
- Re-runs the debit block on approval — prevents race conditions where balance changed between submission and approval
- Returns `409` if the transaction is already decided

---

## Data Model

### `settings` table
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | e.g. `"captainPin"` |
| `value` | TEXT | e.g. `"0000"` |

### `members` table
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4 |
| `name` | TEXT | 1–60 chars |
| `pin` | TEXT | 4 digits, unique enforced in route |
| `colorIdx` | INTEGER | 0–5, maps to frontend colour presets |
| `createdAt` | TEXT | ISO 8601 timestamp |

### `transactions` table
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID v4 |
| `memberId` | TEXT FK | References `members.id` |
| `memberName` | TEXT | Denormalised snapshot — preserved if member is deleted |
| `type` | TEXT | `"credit"` or `"debit"` |
| `amount` | REAL | Must be > 0 |
| `note` | TEXT | Optional |
| `status` | TEXT | `"pending"` / `"approved"` / `"rejected"` |
| `initiatedBy` | TEXT | `"self"` or `"captain"` |
| `createdAt` | TEXT | ISO 8601 timestamp |

---

## Architecture Notes

### Why sql.js?
`sql.js` compiles SQLite to WebAssembly — it requires zero native compilation, making it easy to install on any machine without build tools. The database is loaded into memory on startup and written to disk (`data/roommate.sqlite`) after every write operation. This is fast enough for a household app with small data volumes.

### Balance calculation
There is no stored `balance` column. Balance is computed on-demand by summing all `approved` transactions for a member. `pending` and `rejected` transactions never affect the balance — only what the captain has approved counts.

### Debit block — double enforcement
The block runs at two points:
1. **On submission** — prevents bad requests from ever entering the pending queue
2. **On approval** — prevents a race condition where a member's balance changed (due to another approval) between submission and the captain clicking Approve

### Sessions
Express sessions are stored in-memory (default MemoryStore). This means sessions are lost when the server restarts — users will need to log in again. This is acceptable for a local household tool. For production, swap in a persistent store (e.g. `connect-redis`).

---

## Running Both Servers Together

```bash
# Terminal 1 — backend
cd roommate-tracker-backend
npm run dev

# Terminal 2 — frontend
cd roommate-tracker
npm run dev
```

The frontend (Vite) runs on `http://localhost:5173`.
The backend runs on `http://localhost:3001`.
CORS is pre-configured to allow this combination.
