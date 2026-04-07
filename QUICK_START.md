# Quick Start Guide - Offensive Security Portal

**Time: 10-15 minutes | Setup difficulty: Easy**

## Prerequisites

✅ Already done:
- Node.js 18+
- pnpm installed
- All npm dependencies
- bcryptjs installed (`pnpm add bcryptjs`)

## Step 1: Database Setup (3 minutes)

### 1a. Create MySQL Database

```bash
mysql -u root -p -e "CREATE DATABASE offensive_security CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 1b. Update .env File

File already exists at `.env` with defaults. Edit it:

```env
DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/offensive_security
JWT_SECRET=your-super-secret-key-change-this-generate-one-now-min-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$rKYq18K4Ic3Dj40mqgTGl..PkL1ouI3GVG40Dds4./Ml5kQLtX7ku
NODE_ENV=development
PORT=3000
```

**Replace `YOUR_PASSWORD` with your actual MySQL root password!**

### 1c. Generate Strong JWT Secret

```bash
openssl rand -base64 32
# Copy output and paste into JWT_SECRET in .env
```

### 1d. Run Database Migrations

```bash
pnpm db:push
```

### 1e. Initialize Admin User

```bash
mysql -u root -p offensive_security < init-db.sql
```

Verify:
```bash
mysql -u root -p offensive_security -e "SELECT id, username, name, role FROM users WHERE username='admin';"
```

## Step 2: Start Server (2 minutes)

```bash
pnpm dev
```

Expected output:
```
✓ Server running on http://localhost:3000/
✓ Database connected  
```

## Step 3: Login (2 minutes)

1. Open: **http://localhost:3000/**
2. Should redirect to `/login`
3. Username: `admin`
4. Password: `admin`
5. Click **Login**

## Step 4: Verify (3 minutes)

- [ ] Redirected to home page
- [ ] User "admin" shown in menu
- [ ] Can access all modules
- [ ] Logout works

## Default Credentials

- Username: `admin`
- Password: `admin`

**⚠️ Change immediately after first login!**

## Troubleshooting

### "Cannot find module 'bcryptjs'"
```bash
pnpm add bcryptjs
```

### "Database connection failed"
```bash
# Check MySQL running
mysql -u root -p -e "SELECT 1"

# Check DATABASE_URL in .env
```

### "Migrations failed"
```bash
# Create database manually
mysql -u root -p -e "CREATE DATABASE offensive_security;"

# Try again
pnpm db:push
```

### "Admin user not found" / "Invalid credentials"
```bash
# Initialize admin user
mysql -u root -p offensive_security < init-db.sql

# Or run this:
mysql -u root -p offensive_security << 'EOF'
INSERT INTO users (username, passwordHash, name, email, role, loginMethod, createdAt, updatedAt, lastSignedIn)
VALUES ('admin', '$2b$10$rKYq18K4Ic3Dj40mqgTGl..PkL1ouI3GVG40Dds4./Ml5kQLtX7ku', 'Administrator', 'admin@localhost', 'admin', 'local', NOW(), NOW(), NOW());
EOF
```

### "Port 3000 already in use"
```bash
PORT=3001 pnpm dev
```

## Next: Customize Admin Password

Change default password immediately:

```bash
# Generate new hash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('MySecurePassword123!', 10, (err, hash) => console.log(hash));"

# Update database with new hash
mysql -u root -p offensive_security
UPDATE users SET passwordHash='$2b$10$NEW_HASH_HERE' WHERE username='admin';
```

## Next: Generate Secure JWT Secret

```bash
openssl rand -base64 32
# Paste into JWT_SECRET in .env
# Restart server: Ctrl+C then pnpm dev
```

## Full Documentation

- **Setup Details**: See [SECURITY_SETUP.md](./SECURITY_SETUP.md)
- **Deployment**: See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- **Implementation**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **README**: See [README.md](./README.md)

**Credentials:**
- Username: `admin`
- Password: `changeme123` (the password you hashed above)

## Production Build

```bash
pnpm build
NODE_ENV=production node dist/index.js
```

## Key Features Enabled

✅ Login/Logout with JWT
✅ Protected WiFi, HID, RFID, LAN modules  
✅ Secure activity logging
✅ Settings management (protected)
✅ Device dashboard

## Troubleshooting

**Blank login page?**
- Check browser console for errors
- Verify `DATABASE_URL` is correct
- Ensure MySQL is running

**"Invalid credentials"?**
- Verify hash in database: `SELECT username, passwordHash FROM users;`
- Re-generate hash if needed
- Check for typos in .env

**Port 3000 busy?**
- Kill: `lsof -i :3000 | grep node | awk '{print $2}' | xargs kill -9`
- Or use: `PORT=3001 pnpm dev`

---

See `SECURITY_SETUP.md` for detailed documentation.
