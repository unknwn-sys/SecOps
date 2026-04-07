# Deployment Checklist - Offensive Security Portal

## Pre-Deployment Verification

### Database Setup
- [ ] MySQL server is running and accessible
- [ ] Database exists: `offensive_security`
- [ ] Database URL is correct in `.env`
- [ ] Database user has full privileges
- [ ] Run: `pnpm db:push` - migrations applied successfully
- [ ] Check tables created: `SHOW TABLES;`
- [ ] Admin user created in database

### Authentication Setup
- [ ] Generated bcrypt password hash
- [ ] Hash starts with `$2a$` or `$2b$`
- [ ] `ADMIN_PASSWORD_HASH` set in `.env`
- [ ] `ADMIN_USERNAME` set in `.env`
- [ ] `JWT_SECRET` is 32+ random characters
- [ ] Generated with: `openssl rand -base64 32`

### Environment Configuration
- [ ] `.env` file created (copy from `.env.example`)
- [ ] `DATABASE_URL` configured
- [ ] `JWT_SECRET` configured
- [ ] `ADMIN_USERNAME` configured
- [ ] `ADMIN_PASSWORD_HASH` configured
- [ ] `NODE_ENV=development` (for testing)
- [ ] `.env` is in `.gitignore`

### Dependencies
- [ ] Node.js version 18+: `node --version`
- [ ] pnpm installed: `pnpm --version`
- [ ] Dependencies installed: `pnpm install`
- [ ] No conflicting versions
- [ ] Installation completed without errors

## Development Testing

### Backend Testing
- [ ] Start server: `pnpm dev`
- [ ] Server starts without errors
- [ ] Check console: "Server running on http://localhost:3000"
- [ ] Database connection is established
- [ ] No TypeScript errors

### Frontend Testing
- [ ] Application loads at `http://localhost:3000`
- [ ] Redirected to `/login` page
- [ ] Login page renders correctly
- [ ] Form fields are functional

### Login Testing
- [ ] Enter correct username and password
- [ ] Click "Login" button
- [ ] Receives success response
- [ ] Redirected to home page (`/`)
- [ ] User info displayed in navbar
- [ ] Token stored in localStorage (check DevTools)

### Protected Routes Testing
- [ ] Try to access `/wifi` without login
- [ ] Should be redirected to `/login`
- [ ] After login, `/wifi` loads
- [ ] WiFi operations require authentication
- [ ] HID, RFID, LAN modules work when authenticated

### API Testing
- [ ] Test login endpoint:
  ```bash
  curl -X POST http://localhost:3000/api/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"YourPassword"}'
  ```
- [ ] Receive token in response
- [ ] Use token in Authorization header for protected routes

### Logout Testing
- [ ] Click logout button
- [ ] Token removed from localStorage
- [ ] Redirected to login page (`/login`)
- [ ] Cannot access protected routes

### Error Handling Testing
- [ ] Login with wrong password → "Invalid credentials"
- [ ] Login with wrong username → "Invalid credentials"
- [ ] Leave fields empty → validation error
- [ ] Modify token in localStorage → "Unauthorized"
- [ ] Access to protected route without auth → redirect to login

## Build & Production Testing

### Build Step
- [ ] Run: `pnpm build`
- [ ] Completes without errors
- [ ] Check build output:
  ```bash
  ls -la dist/
  # Should contain: index.js, client assets
  ```
- [ ] No TypeScript errors during build
- [ ] Bundle size is reasonable

### Production Mode Testing
- [ ] Clean build directory: `rm -rf dist`
- [ ] Build: `pnpm build`
- [ ] Set environment:
  ```bash
  NODE_ENV=production
  ADMIN_PASSWORD_HASH=$2a$10$...
  ADMIN_USERNAME=admin
  JWT_SECRET=your-secret
  DATABASE_URL=mysql://...
  ```
- [ ] Run: `node dist/index.js`
- [ ] Server starts and logs ready message
- [ ] Application accessible at `http://localhost:3000`
- [ ] Full login flow works in production

### Performance Testing
- [ ] Measure response times
- [ ] Login endpoint < 500ms
- [ ] Protected endpoints < 100ms
- [ ] Database queries optimized
- [ ] No memory leaks after 1 hour of use

## Raspberry Pi Deployment

### Pi Preparation
- [ ] Raspberry Pi Zero 2W running
- [ ] Raspbian OS updated: `sudo apt update && sudo apt upgrade`
- [ ] Node.js 18+ installed
- [ ] MySQL running on Pi or accessible remotely
- [ ] SSH access configured
- [ ] Firewall rules allow port 3000

### Transfer to Pi
- [ ] Create deployment directory: `mkdir -p /opt/offensive-portal`
- [ ] Copy built files:
  ```bash
  scp -r dist/ pi@raspberrypi.local:/opt/offensive-portal/
  scp .env pi@raspberrypi.local:/opt/offensive-portal/
  ```
- [ ] SSH into Pi: `ssh pi@raspberrypi.local`
- [ ] Verify files: `ls -la /opt/offensive-portal/`

### Pi Runtime Setup
- [ ] Install PM2: `npm install -g pm2`
- [ ] Create `ecosystem.config.js`:
  ```javascript
  module.exports = {
    apps: [{
      name: 'offensive-portal',
      script: './dist/index.js',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://...',
        JWT_SECRET: 'your-secret',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD_HASH: '$2a$10$...'
      }
    }]
  };
  ```
- [ ] Start with PM2: `pm2 start ecosystem.config.js`
- [ ] Enable auto-start: `pm2 startup`
- [ ] Save PM2 config: `pm2 save`

### Pi Verification
- [ ] App starts on boot: reboot and verify
- [ ] Access at: `http://raspberry-pi-ip:3000`
- [ ] Login works
- [ ] All modules accessible
- [ ] Activity logs record operations
- [ ] Check logs: `pm2 logs offensive-portal`

## Security Verification

### Password Security
- [ ] Admin password is strong (16+ characters recommended)
- [ ] Not using default/weak passwords
- [ ] Password hash is valid bcrypt format
- [ ] Password stored in hash form only

### JWT Security
- [ ] JWT_SECRET is 32+ random characters
- [ ] Secret not hardcoded in source
- [ ] Secret stored in `.env` (not committed)
- [ ] Token expiration is 7 days
- [ ] Token includes user ID and role

### Route Protection
- [ ] All mutations require authentication
- [ ] Queries with sensitive data protected
- [ ] Public endpoints minimal (only read-only non-sensitive data)
- [ ] Activity logs include user ID
- [ ] No sensitive data in error messages

### Database Security
- [ ] Passwords hashed with bcrypt
- [ ] No plain-text credentials in database
- [ ] Database user has minimal required permissions
- [ ] Database backups are encrypted
- [ ] Connection uses SSL/TLS if in cloud

### API Security
- [ ] HTTPS enabled if exposed externally
- [ ] CORS properly configured
- [ ] Rate limiting on login endpoint (if added)
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (via ORM)

## Documentation

### Deployment Doc
- [ ] `SECURITY_SETUP.md` reviewed
- [ ] `QUICK_START.md` tested step-by-step
- [ ] `README.md` matches current state
- [ ] `IMPLEMENTATION_SUMMARY.md` archived
- [ ] `.env.example` kept updated

### Operational Docs
- [ ] Runbooks created for common tasks
- [ ] Troubleshooting guide updated
- [ ] API documentation reviewed
- [ ] Database schema documented
- [ ] Backup & recovery procedures documented

## Monitoring & Maintenance

### Logging Setup
- [ ] Access logs configured
- [ ] Error logs reviewed
- [ ] Activity logs stored in database
- [ ] Log rotation configured
- [ ] Log retention policy defined

### Backup Strategy
- [ ] Database backups scheduled (daily recommended)
- [ ] Backup encryption enabled
- [ ] Backup recovery tested
- [ ] Offsite backup location configured
- [ ] Backup retention policy defined

### Health Checks
- [ ] Implement `/health` endpoint
- [ ] Monitor uptime with external service
- [ ] Alert on failures
- [ ] Performance metrics collected
- [ ] Resource usage monitored

## Post-Deployment

### Verification Checklist
- [ ] All modules accessible
- [ ] Login/logout flow works
- [ ] Protected routes enforce auth
- [ ] Activity logs record all actions
- [ ] No console errors
- [ ] No database errors

### Configuration Review
- [ ] Change admin password from defaults
- [ ] Rotate JWT_SECRET from examples
- [ ] Update NVIDIA database URL
- [ ] Review and update environment for target
- [ ] Verify all HTTPS/SSL certificates if applicable

### Security Hardening
- [ ] Firewall rules configured
- [ ] Unnecessary services disabled
- [ ] System packages updated
- [ ] SSH key-based auth only
- [ ] sudo password protected
- [ ] Network segmentation implemented

### Performance Optimization
- [ ] Database indexes optimized
- [ ] Query performance reviewed
- [ ] Caching implemented where beneficial
- [ ] Memory usage within limits
- [ ] CPU usage reasonable

## Sign-Off

### Development Team
- [ ] Code review completed
- [ ] All tests passing
- [ ] Documentation reviewed
- [ ] Security review approved
- [ ] Deployment approved

### Operations Team
- [ ] Infrastructure ready
- [ ] Monitoring configured
- [ ] Backup procedures tested
- [ ] Runbooks prepared
- [ ] On-call rotation assigned

### Security Team
- [ ] Security audit completed
- [ ] Vulnerabilities remediated
- [ ] Compliance verified
- [ ] Penetration testing done (if applicable)
- [ ] Security sign-off given

## Launch

- [ ] Schedule maintenance window
- [ ] Notify users of deployment
- [ ] Deploy to production
- [ ] Verify functionality
- [ ] Monitor for issues
- [ ] Keep support team on standby
- [ ] Document any issues encountered

## Post-Launch Monitoring (First Week)

- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Review activity logs
- [ ] Verify backups working
- [ ] Confirm all features operational
- [ ] Gather user feedback
- [ ] Document lessons learned
- [ ] Plan improvements for next iteration

---

## Quick Reference Commands

```bash
# Development
pnpm install
pnpm dev

# Build
pnpm build

# Testing
pnpm test
pnpm check

# Database
pnpm db:push
pnpm db:generate

# Format
pnpm format

# Production Run
NODE_ENV=production node dist/index.js
```

## Support Contacts

- **Development**: [Team Lead Email]
- **Operations**: [Ops Manager Email]
- **Security**: [Security Officer Email]
- **Database**: [DBA Email]

---

**Checklist Created**: April 6, 2026
**Last Updated**: April 6, 2026
**Status**: Ready for Use

✅ All systems ready for deployment
