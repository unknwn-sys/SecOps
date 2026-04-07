# Offensive Security Portal - Security Setup Guide

## Overview

This guide covers the complete setup for the Offensive Security Portal with JWT-based single-user authentication.

## Prerequisites

- Node.js 18+ and pnpm
- MySQL 8.0+ (or compatible database)
- Raspberry Pi Zero 2 W (target deployment)

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
DATABASE_URL=mysql://username:password@localhost:3306/offensive_security

# JWT & Authentication
JWT_SECRET=your-secure-random-secret-key-min-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=your_bcrypt_hashed_password

# Node Environment
NODE_ENV=development
VITE_APP_ID=offensive-portal

# Optional: OAuth (if using legacy OAuth, set to empty for local auth only)
OAUTH_SERVER_URL=
OWNER_OPEN_ID=
```

## Generating Admin Password Hash

Use bcryptjs to generate a secure password hash:

```bash
# Install bcryptjs globally or locally
npm install -g bcryptjs

# Generate hash (interactive)
npx bcryptjs
# Enter password when prompted and copy the hash

# Or use Node.js directly
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your_password', 10, (err, hash) => console.log(hash));"
```

**Example:**
- Password: `SecureAdminPass123!`
- Hash: `$2a$10$...` (store this in ADMIN_PASSWORD_HASH)

## Database Setup

### 1. Create Database

```sql
CREATE DATABASE offensive_security CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configure Drizzle

```bash
# Generate migrations
pnpm db:push
```

This will:
- Generate SQL migrations based on schema.ts
- Apply migrations to the database
- Create all required tables

### 3. Initialize Admin User

The admin user should be created via your database initialization script or manually:

```sql
INSERT INTO users (
  id,
  username,
  passwordHash,
  name,
  email,
  role,
  loginMethod,
  createdAt,
  updatedAt,
  lastSignedIn
) VALUES (
  1,
  'admin',
  '$2a$10$...',  -- Use the hash from previous step
  'Administrator',
  'admin@offensive-portal.local',
  'admin',
  'local',
  NOW(),
  NOW(),
  NOW()
);
```

## Project Structure

```
offensive-security-portal/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx     # NEW: Login page
│   │   │   ├── Home.tsx
│   │   │   └── ...
│   │   ├── components/
│   │   ├── _core/hooks/
│   │   │   └── useAuth.ts    # UPDATED: JWT-based auth
│   │   ├── lib/
│   │   │   └── trpc.ts
│   │   ├── const.ts          # UPDATED: New auth constants
│   │   └── main.tsx          # UPDATED: JWT header injection
│   └── package.json
├── server/
│   ├── _core/
│   │   ├── auth.ts           # NEW: JWT utilities
│   │   ├── context.ts        # UPDATED: JWT extraction
│   │   ├── env.ts            # UPDATED: New env vars
│   │   ├── systemRouter.ts   # Updated: Clean auth logic
│   │   └── trpc.ts
│   ├── routers/
│   │   ├── wifi.ts           # UPDATED: protectedProcedure
│   │   ├── hid.ts            # UPDATED: protectedProcedure
│   │   ├── rfid.ts           # UPDATED: protectedProcedure
│   │   ├── lan.ts            # UPDATED: protectedProcedure
│   │   ├── settings.ts       # UPDATED: Protected mutations
│   │   └── logging.ts        # UPDATED: protectedProcedure
│   ├── db.ts                 # UPDATED: New user functions
│   ├── routers.ts            # UPDATED: Login mutation
│   └── package.json
├── drizzle/
│   └── schema.ts             # UPDATED: Optional username/passwordHash
└── .env                       # NEW: Environment configuration
```

## Installation & Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Setup Environment

Create `.env` file with values from the "Environment Variables" section above.

### 3. Setup Database

```bash
# Generate and run migrations
pnpm run db:push
```

### 4. Initialize Admin User

Execute the SQL INSERT statement from "Database Setup" section.

### 5. Start Development Server

```bash
# Terminal 1: Start backend
pnpm run dev

# Terminal 2: Build frontend (in another terminal, if needed for watch mode)
# The dev command handles both
```

Access the portal at: `http://localhost:3000/`

## Authentication Flow

### Login Process

1. User navigates to `/login`
2. Enters username and password
3. Frontend calls `auth.login` mutation
4. Server validates credentials against database
5. Server returns JWT token (valid for 7 days)
6. Frontend stores token in `localStorage` under `auth_token` key
7. Frontend redirects to home page
8. All subsequent requests include `Authorization: Bearer <token>` header

### Protected Routes

All module operations require authentication:

- **WiFi Module**: `startScan`, `stopScan`, `addNetwork`
- **HID Module**: `createPayload`, `updatePayload`, `executePayload`, `listPayloads`
- **RFID Module**: `startScan`, `stopScan`, `cloneTag`, `replayTag`, `emulateTag`
- **LAN Module**: `startScan`, `stopScan`, `deployPayload`
- **Logging Module**: `getLogs`, `getStats`
- **Settings Module**: `updateSetting`, `updateHardwareConfig`, `getHardwareConfig`

### Logout Process

1. User clicks logout button
2. Frontend calls `auth.logout` mutation
3. Server clears session cookie
4. Frontend removes token from localStorage
5. Frontend redirects to login page

## Security Features

✅ **Single-user authentication** - Only one admin account
✅ **JWT-based sessions** - Token-based, not cookie-dependent
✅ **Password hashing** - Bcrypt with configurable cost
✅ **Protected routes** - All sensitive operations require auth
✅ **Token expiration** - 7-day TTL included in JWT
✅ **Timing-safe comparison** - Fallback password validation
✅ **Automatic redirect** - Unauthenticated users redirected to login
✅ **Activity logging** - All user actions logged to database

## Raspberry Pi Deployment

### Build for Production

```bash
pnpm run build
```

This creates:
- `dist/` - Production bundle
- `dist/index.js` - Production server

### Run on Raspberry Pi Zero 2 W

```bash
# Copy built files to Pi
scp -r dist/ pi@raspberrypi.local:/home/pi/offensive-security-portal/

# SSH into Pi and run
ssh pi@raspberrypi.local
cd /home/pi/offensive-security-portal
NODE_ENV=production ADMIN_PASSWORD_HASH=$2a$10$... \
  ADMIN_USERNAME=admin \
  JWT_SECRET=your-secret \
  DATABASE_URL=mysql://user:pass@localhost/offensive_security \
  node dist/index.js
```

### Use PM2 for Auto-restart

```bash
# Install PM2 on Pi
npm install -g pm2

# Create PM2 config (ecosystem.config.js)
# Then run: pm2 start ecosystem.config.js
```

## Testing Authentication

### Test Login

```bash
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "SecureAdminPass123!"
  }'
```

### Test Protected Route

```bash
# Get token from login response
TOKEN="eyJhbGciOiJIUzI1NiIs..."

curl -X POST http://localhost:3000/api/trpc/wifi.startScan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting

### Login fails with "Invalid credentials"

1. Verify `ADMIN_PASSWORD_HASH` is set correctly in `.env`
2. Check admin user exists in database: `SELECT * FROM users WHERE username='admin';`
3. Verify password hash is valid bcrypt format: `$2a$10$...`

### "Unauthorized" error on protected routes

1. Verify token is stored in localStorage: `localStorage.getItem('auth_token')`
2. Check token expiration: decode JWT at jwt.io
3. Verify Authorization header is sent: check browser DevTools Network tab

### Token not persisting after page reload

1. Check localStorage is enabled in browser settings
2. Verify `auth_token` key is set: `localStorage.getItem('auth_token')`
3. Ensure cookie privacy settings permit localStorage

### Database connection error

1. Verify `DATABASE_URL` format: `mysql://user:pass@host:port/dbname`
2. Test connection: `mysql -u user -p -h host`
3. Check MySQL service is running: `systemctl status mysql`

### Port already in use

```bash
# Find process on port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use next available port
PORT=3001 pnpm run dev
```

## Next Steps

1. ✅ Set `.env` variables
2. ✅ Create database and run migrations
3. ✅ Create admin user
4. ✅ Test login at `/login`
5. ✅ Verify protected routes require authentication
6. ✅ Deploy to Raspberry Pi

## Security Checklist

Before production deployment:

- [ ] Change `JWT_SECRET` to a strong, random value (min 32 chars)
- [ ] Use bcrypt-hashed password (min 10 rounds)
- [ ] Enable HTTPS in reverse proxy (nginx/Apache)
- [ ] Set `NODE_ENV=production`
- [ ] Enable database backups
- [ ] Monitor activity logs regularly
- [ ] Rotate JWT_SECRET periodically
- [ ] Limit API rate if exposed to untrusted networks
- [ ] Use strong Firebase/OAuth if multi-user needed

## Support

For issues or questions:
1. Check logs: `npm run test`
2. Review error messages in browser console
3. Check server logs for detailed errors
4. Verify environment variables are set

---

**Last Updated**: 2026-04-06
**Version**: 1.0.0 (JWT Authentication Ready)
