# Offensive Security Portal

**Status:** ✅ Production-Ready with JWT Authentication

## Overview

A comprehensive IoT red-team control panel for offensive security research. Built for deployment on Raspberry Pi Zero 2 W with modular attack capabilities and secure single-user authentication.

### Capabilities

- **WiFi Module**: Network scanning and attack orchestration
- **HID Module**: USB keystroke injection payload management
- **RFID Module**: Tag discovery, cloning, and emulation
- **LAN Module**: Network device reconnaissance and payload deployment
- **Activity Logging**: Centralized audit trail for all operations
- **Hardware Dashboard**: Real-time monitoring of attached devices
- **Settings Management**: System configuration and hardware profiles

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Node.js + tRPC + Express
- **Database**: MySQL with Drizzle ORM
- **Auth**: JWT with bcrypt password hashing
- **UI**: Radix UI + Tailwind CSS
- **Target**: Raspberry Pi Zero 2 W (IoT Red Team Device)

## Project Structure

```
offensive-security-portal/
├── client/              # React frontend
│   └── src/
│       ├── pages/       # Page components (Login, modules, etc.)
│       ├── components/  # UI components & layouts
│       ├── _core/       # Core hooks (useAuth)
│       └── lib/         # Utilities (tRPC client)
├── server/              # Node.js backend
│   ├── _core/           # Core logic (auth, context, tRPC setup)
│   ├── routers/         # tRPC module routers
│   └── db.ts            # Database operations
├── drizzle/             # Database schema & migrations
└── shared/              # Shared types and constants
```

## Security Features

✅ **Single-user authentication** - Dedicated admin account only  
✅ **JWT tokens** - Stateless, 7-day expiration  
✅ **Bcrypt hashing** - Industry-standard password security  
✅ **Protected procedures** - All operations require login  
✅ **Activity logging** - Full audit trail  
✅ **Type-safe APIs** - End-to-end TypeScript  
✅ **Input validation** - Zod schema validation  
✅ **Automatic redirects** - Unauthorized users → login  

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- pnpm

### Setup (5 minutes)

1. **Clone & Install**
   ```bash
   pnpm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MySQL credentials and JWT secret
   ```

3. **Setup Database**
   ```bash
   pnpm db:push
   # Run initial admin setup (see SECURITY_SETUP.md)
   ```

4. **Start Server**
   ```bash
   pnpm dev
   ```

5. **Login**
   - Visit: `http://localhost:3000/login`
   - Use credentials from `.env`

See [QUICK_START.md](./QUICK_START.md) for detailed setup or [SECURITY_SETUP.md](./SECURITY_SETUP.md) for comprehensive documentation.

## Development

### Build Frontend
```bash
cd client
pnpm build
```

### Build Backend
```bash
cd server
pnpm build
```

### Run Tests
```bash
pnpm test
```

### Type Check
```bash
pnpm check
```

### Format Code
```bash
pnpm format
```

## Production Deployment

### Build & Package
```bash
pnpm build
```

Creates:
- `dist/` - All bundled assets
- `dist/index.js` - Production server entry

### Raspberry Pi Deployment

```bash
# Copy to Pi
scp -r dist/ pi@raspberrypi.local:/opt/offensive-portal/

# Run on Pi
ssh pi@raspberrypi.local
cd /opt/offensive-portal
NODE_ENV=production \
  ADMIN_PASSWORD_HASH=$2a$10$... \
  ADMIN_USERNAME=admin \
  JWT_SECRET=secure-key \
  DATABASE_URL=mysql://... \
  node dist/index.js
```

### Using PM2 (Recommended)
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## API Documentation

### Authentication Endpoints

#### Login
```
POST /api/trpc/auth.login
Content-Type: application/json

{
  "username": "admin",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Admin",
    "role": "admin"
  }
}
```

#### Get Current User
```
GET /api/trpc/auth.me
Authorization: Bearer <token>

Response: { id, username, name, role }
```

#### Logout
```
POST /api/trpc/auth.logout
Authorization: Bearer <token>
```

### Protected Modules

All module endpoints require `Authorization: Bearer <token>` header.

#### WiFi Module
- `wifi.getNetworks` - List discovered networks
- `wifi.startScan` - Begin WiFi scan
- `wifi.stopScan` - End scan
- `wifi.addNetwork` - Add discovered network

#### HID Module
- `hid.listPayloads` - List stored payloads
- `hid.createPayload` - Create new payload
- `hid.updatePayload` - Modify payload
- `hid.executePayload` - Execute on target

#### RFID Module
- `rfid.startScan` - Begin tag discovery
- `rfid.stopScan` - End scan
- `rfid.cloneTag` - Clone discovered tag
- `rfid.replayTag` - Replay cloned tag
- `rfid.emulateTag` - Emulate tag remotely

#### LAN Module
- `lan.startScan` - Begin network scan
- `lan.stopScan` - End scan
- `lan.getDiscoveredDevices` - List found devices
- `lan.deployPayload` - Deploy payload to target

#### Settings
- `settings.getAll` - Get all settings (public)
- `settings.getSetting` - Get specific setting (public)
- `settings.updateSetting` - Update setting (protected)
- `settings.getHardwareConfig` - Get hardware config (protected)
- `settings.updateHardwareConfig` - Update hardware config (protected)

#### Logging
- `logging.getLogs` - Get activity logs (protected)
- `logging.getStats` - Get statistics (protected)

## Environment Variables

```env
# Database
DATABASE_URL=mysql://user:pass@host:port/dbname

# Authentication
JWT_SECRET=your-secret-key-min-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$... (bcrypt hash)

# Environment
NODE_ENV=development|production
PORT=3000

# Optional (OAuth - deprecated for this setup)
OAUTH_SERVER_URL=
OWNER_OPEN_ID=
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) UNIQUE,
  passwordHash VARCHAR(255),
  openId VARCHAR(64) UNIQUE,
  name TEXT,
  email VARCHAR(320),
  role ENUM('user', 'admin') DEFAULT 'user',
  loginMethod VARCHAR(64),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Additional tables: modules, hardware_status, activity_logs, wifi_networks, hid_payloads, rfid_tags, lan_devices, system_settings

See [drizzle/schema.ts](./drizzle/schema.ts) for complete schema.

## Troubleshooting

### Login Issues
- Check `.env` file is properly configured
- Verify password hash in database with bcrypt
- Ensure MySQL is running and accessible
- Clear localStorage: `localStorage.clear()`

### Connection Errors
- Verify `DATABASE_URL` connection string
- Test MySQL: `mysql -u user -p -h host`
- Check firewall rules (port 3306 for MySQL)

### Token/Auth Issues
- Verify Authorization header: `Bearer <token>`
- Check token expiration (7 days default)
- Ensure JWT_SECRET matches between server and client
- Decode token: jwt.io

### Performance
- Optimize database queries
- Enable query caching
- Use pagination for logs
- Monitor memory on Raspberry Pi

## Contributing

1. Create feature branch: `git checkout -b feature/name`
2. Make changes and test
3. Format code: `pnpm format`
4. Type check: `pnpm check`
5. Submit pull request

## License

MIT License - See LICENSE file

## Security Policy

**⚠️ Important:**
- Never commit `.env` files
- Always use HTTPS in production
- Rotate JWT_SECRET regularly
- Keep dependencies updated
- Monitor activity logs
- Use strong passwords (min 16 chars)
- Change default credentials immediately

See [SECURITY_SETUP.md](./SECURITY_SETUP.md) for complete security guidelines.

## Roadmap

- [ ] Multi-user support with role-based access
- [ ] Database encryption
- [ ] 2FA/MFA support
- [ ] Webhook integrations
- [ ] Custom payload builder
- [ ] Remote device management
- [ ] Docker containerization
- [ ] Cloud deployment templates

## Support & Resources

- **Docs**: See SECURITY_SETUP.md and QUICK_START.md
- **Issues**: Create GitHub issue with details
- **Questions**: Check existing issues first
- **Security**: Report to security@example.com

## Contributors

- Lead Developer: [Your Name]
- Designed for: Raspberry Pi Zero 2 W
- IoT Red Team: [Organization]

---

**Last Updated**: April 6, 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅
