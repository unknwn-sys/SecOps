# Security Hardening & Best Practices

**Status:** Production Deployment Security Guide  
**Last Updated:** April 2026

---

## ⚠️ Security Responsibility

This device is intended **EXCLUSIVELY** for authorized testing in controlled environments. Users are responsible for:
- Obtaining written authorization before any testing
- Complying with all applicable laws and regulations
- Maintaining audit trails
- Securing the device against unauthorized access
- Regular security reviews

---

## 1. Authentication Security

### 1.1 Default Credentials

**CRITICAL:** Change all default credentials before first deployment.

```bash
# Change Ubuntu user password
passwd ubuntu
# Enter new password (min 16 chars, mixed case, numbers, symbols)

# In Dashboard: Settings → Admin → Change Password
# Enter old password, then new password
# Passwords stored as bcrypt hashes (10 cost factor, 10^10 comparisons)
```

### 1.2 Generate Secure Passwords

```bash
# Generate 32-character random password
openssl rand -base64 32

# Generate bcrypt hash (10 cost factor)
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123!', 10, (err, hash) => console.log(hash));"

# Or use online generator (for testing only):
# https://bcrypt-generator.com
```

### 1.3 JWT Token Security

**Token Configuration:**
```bash
# .env
JWT_SECRET=<32+ character random string>
COOKIE_SECRET=<same or different 32+ char string>
```

**Token Expiration:**
- Default: 7 days
- To change: Edit `server/_core/auth.ts`
- Implement refresh tokens for sensitive operations

---

## 2. SSH Access Security

### 2.1 SSH Key Authentication (REQUIRED)

```bash
# On your workstation
ssh-keygen -t ed25519 -f ~/.ssh/rpi_key
# Passphrase protects the key file itself

# Copy to Pi
ssh-copy-id -i ~/.ssh/rpi_key.pub ubuntu@<IP>

# Test
ssh -i ~/.ssh/rpi_key ubuntu@<IP>
# Should not prompt for password
```

### 2.2 Disable Password Authentication

```bash
sudo nano /etc/ssh/sshd_config

# Change/add these lines:
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
PermitEmptyPasswords no
Protocol 2

# Restart SSH
sudo systemctl restart ssh

# Verify settings
sshd -T | grep -E "passwordauth|pubkeyauth"
```

### 2.3 SSH Port Hardening

```bash
# Change SSH port (optional, adds obscurity)
sudo nano /etc/ssh/sshd_config
# Change: Port 22 to Port 2222

# Restart SSH
sudo systemctl restart ssh

# SSH with custom port:
ssh -i ~/.ssh/rpi_key -p 2222 ubuntu@<IP>

# Update firewall:
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

---

## 3. Firewall Configuration

### 3.1 UFW (Uncomplicated Firewall)

```bash
# Enable firewall
sudo ufw enable

# Set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw default deny routed

# Allow SSH (your network only)
sudo ufw allow from 192.168.1.0/24 to any port 22

# Allow dashboard (your network only)
sudo ufw allow from 192.168.1.0/24 to any port 3000

# View rules
sudo ufw status numbered

# Delete rule
sudo ufw delete 1

# Disable if needed
sudo ufw disable
```

### 3.2 iptables Rules (Advanced)

```bash
# Prevent external WiFi adapter from reaching WAN
sudo iptables -A FORWARD -i wlan1 -o eth0 -j DROP
sudo iptables -A FORWARD -i eth0 -o wlan1 -j DROP

# Drop all invalid connections
sudo iptables -A INPUT -m state --state INVALID -j DROP

# SSH brute-force protection
sudo iptables -A INPUT -p tcp -m state --state NEW -m recent --set
sudo iptables -A INPUT -p tcp -m state --state NEW -m recent --update --seconds 60 --hitcount 3 -j DROP

# Save rules
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

---

## 4. Network Security

### 4.1 Isolate Control & Testing Networks

```
wlan0:  192.168.1.100 (control network - your main WiFi)
        └─ Used for SSH, dashboard access
        └─ KEEP IN MANAGED MODE

wlan1:  192.168.2.X   (testing network - external USB adapter)
        └─ Used for WiFi scanning/testing
        └─ KEEP IN MONITOR MODE (disconnected)
        └─ NO CLIENT INTERNET ACCESS

eth0:   (if Ethernet available)
        └─ Used for local testing network access
```

**Configure /etc/netplan/99-custom.yaml:**

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: no
      addresses: [192.168.2.1/24]
      routes:
        - to: 0.0.0.0/0
          via: 192.168.2.1
          on-link: true
  wifis:
    wlan0:
      dhcp4: yes
      access-points:
        "ControlNetworkSSID":
          password: "SecurePassword"
    wlan1:
      dhcp4: no
      # Keep unconnected for testing
```

### 4.2 DNS & DHCP Hardening

```bash
# Don't rely on ISP DNS (potential spying)
# Configure OpenDNS or Cloudflare in netplan:

network:
  version: 2
  ethernets:
    eth0:
      dhcp4: yes
      dhcp4-overrides:
        use-dns: false
      nameservers:
        addresses: [1.1.1.1, 1.0.0.1]  # Cloudflare
        # Or: [208.67.222.222, 208.67.220.220]  # OpenDNS
```

---

## 5. File System Security

### 5.1 Directory Permissions

```bash
# Restrict application directory
sudo chmod 750 /opt/offensive-security-portal
sudo chown ubuntu:ubuntu /opt/offensive-security-portal

# Restrict sensitive files
sudo chmod 600 /opt/offensive-security-portal/.env
sudo chmod 600 ~/.ssh/rpi_key

# Database security
sudo chmod 700 /opt/offensive-security-portal/data/
sudo chmod 600 /opt/offensive-security-portal/data/dev.db
```

### 5.2 Log Access Control

```bash
# Journalctl access (systemd logs)
sudo journalctl -u offensive-security.service -f

# View as non-root:
sudo usermod -a -G systemd-journal ubuntu

# Application logs
sudo chmod 750 /opt/offensive-security-portal/logs/
sudo chmod 640 /opt/offensive-security-portal/logs/*.log
```

### 5.3 SELinux (Optional, Advanced)

```bash
# Enable SELinux (if running Fedora-based OS)
sudo semanage permissive -a offensive-security_t

# Or use AppArmor on Ubuntu
sudo apt install -y apparmor apparmor-utils
sudo aa-enforce /etc/apparmor.d/usr.bin.node
```

---

## 6. UART & Hardware Security

### 6.1 Serial Port Access Control

```bash
# UART device permissions
sudo ls -la /dev/ttyUSB0

# Add user to dialout group (allows non-root access)
sudo usermod -a -G dialout ubuntu
# Log out and back in for effect

# Check group membership
groups ubuntu
```

### 6.2 ESP32 Firmware Security

```bash
# Firmware is stored in FLASH memory
# Once uploaded, cannot be remotely modified without proper access

# Best practice: Use signed firmware (future enhancement)
# Enable ESP32 secure boot in Arduino IDE:
# Tools → Partition Scheme → With Secure Boot
```

### 6.3 RFID Module Security

```c
// In ESP32 firmware (main.ino):

// 1. Encrypt sensitive RFID data
// 2. Validate card UIDs before processing
// 3. Log all card read attempts

// Current implementation logs to UART
// Encrypted storage would require additional library
```

---

## 7. Data Protection

### 7.1 Database Security

```bash
# Backup database regularly
sudo cp /opt/offensive-security-portal/data/dev.db \
  /opt/offensive-security-portal/backups/dev.db.$(date +%Y%m%d)

# For MySQL (remote database):
mysqldump -u app_user -p offensive_security > backup.sql

# Restore from backup:
mysql -u app_user -p offensive_security < backup.sql

# Encrypt backups
gpg --default-recipient-self -e backup.sql
# Outputs: backup.sql.gpg
```

### 7.2 Payload Storage

```bash
# Payloads stored in: /opt/offensive-security-portal/data/payloads/hid/

# Restrict access:
sudo chmod 700 /opt/offensive-security-portal/data/payloads/

# Audit payloads:
ls -la /opt/offensive-security-portal/data/payloads/**/*.json
```

### 7.3 Audit Logging

```bash
# All operations logged to database (activity_logs table)
# Access logs: sudo journalctl -u offensive-security.service

# Export audit logs:
sqlite3 /opt/offensive-security-portal/data/dev.db
> SELECT * FROM activity_logs ORDER BY startedAt DESC LIMIT 100;
> .mode csv
> .output audit_export.csv
> SELECT * FROM activity_logs;
> .quit

# For MySQL:
mysql -u app_user -p offensive_security \
  -e "SELECT * FROM activity_logs;" > audit_export.csv
```

---

## 8. Update & Patch Management

### 8.1 System Updates

```bash
# Enable automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Verify auto-updates are enabled
sudo cat /etc/apt/apt.conf.d/50unattended-upgrades | grep -i enable

# Manual updates
sudo apt update
sudo apt upgrade -y
sudo apt install -y --only-upgrade nodejs  # Update Node.js
```

### 8.2 Application Updates

```bash
# Update project dependencies
cd /opt/offensive-security-portal

# Check for updates
pnpm outdated

# Update carefully
pnpm update --latest

# Test
pnpm build

# Restart service
sudo systemctl restart offensive-security.service
```

### 8.3 ESP32 Firmware Updates

```bash
# In Arduino IDE:
# 1. Modify esp32_firmware/main.ino
# 2. Verify & Upload
# 3. Check Serial Monitor for "Ready" message
```

---

## 9. Incident Response

### 9.1 Suspected Breach

```bash
# 1. Isolate device from network
sudo ip link set wlan0 down
sudo ip link set eth0 down

# 2. Collect evidence
sudo journalctl > /tmp/system.log
sudo journalctl -u offensive-security.service > /tmp/service.log
sudo cp /opt/offensive-security-portal/logs/* /tmp/

# 3. Review activities
sqlite3 /opt/offensive-security-portal/data/dev.db \
  "SELECT * FROM activity_logs WHERE startedAt > datetime('now', '-24 hours');"

# 4. Change all credentials
sudo passwd ubuntu
# Update .env ADMIN_PASSWORD_HASH and JWT_SECRET

# 5. Rebuild from clean state (if critical)
sudo systemctl stop offensive-security.service
sudo rm -rf /opt/offensive-security-portal
# Redeploy from version control
```

### 9.2 Hardware Inspection

```bash
# Check for physical tampering
# - Inspect USB ports for modifications
# - Verify ESP32 firmware matches source
# - Test RFID module for unauthorized writes

# Software verification
sha256sum /opt/offensive-security-portal/dist/index.js
# Compare with known good hash
```

---

## 10. Deployment Environment Hardening

### 10.1 Lab Environment Setup

```
┌─────────────────────────────────────┐
│   ISOLATED TEST NETWORK             │
│  (Air-gapped or separate VLAN)      │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Raspberry Pi Device        │   │
│  │  - wlan0: No connection     │   │
│  │  - wlan1: Monitor mode      │   │
│  │  - eth0: Test network only  │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Target Devices             │   │
│  │  (test systems)             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
         ↓ Airgap or Firewall
┌─────────────────────────────────────┐
│   CONTROL NETWORK                   │
│  (Your workstation, logging)        │
└─────────────────────────────────────┘
```

### 10.2 Physical Security

```bash
# Device physically isolated in lab
# - Locked cabinet
# - Restricted physical access
# - RFID badge access logging

# Power management
# - UPS backup (prevent sudden shutdown)
# - Monitored power consumption

# Logging & monitoring
# - Continuous monitoring of logs
# - Alerts for unauthorized access
# - Regular security audits
```

---

## 11. Compliance & Documentation

### 11.1 Authorization Documentation

**Store Securely (encrypted/offline):**
```
AUTHORIZATION_DOCUMENT.txt
├─ Project: [Name]
├─ Scope: [Specific devices/networks authorized]
├─ Duration: [Start date] to [End date]
├─ Authorized by: [Name/Title]
├─ Signature: _____________________
├─ Device SN: [Serial number]
├─ Firmware Hash: [SHA256]
└─ Test Date: [YYYY-MM-DD]
```

### 11.2 Audit Trail

```bash
# Generate audit report
sudo journalctl -u offensive-security.service \
  --since="2024-01-01" \
  --until="2024-01-31" \
  > /tmp/audit_report.txt

# Export database audit logs
sqlite3 /opt/offensive-security-portal/data/dev.db \
  "SELECT startedAt, userId, action, status FROM activity_logs \
   WHERE startedAt BETWEEN '2024-01-01' AND '2024-01-31';" \
  > /tmp/activity_audit.csv
```

### 11.3 Incident Documentation

**For each test/incident, document:**
- [ ] Date/time started
- [ ] Authorized user
- [ ] Modules tested
- [ ] Systems targeted
- [ ] Results (success/failure)
- [ ] Issues encountered
- [ ] Recommendations

---

## 12. Security Checklist

### Pre-Deployment
- [ ] All default credentials changed
- [ ] SSH key authentication enabled
- [ ] SSH password authentication disabled
- [ ] Firewall rules configured
- [ ] Network isolation verified
- [ ] Secure password generated (32+ chars)
- [ ] Bcrypt password hash generated
- [ ] JWT secret configured
- [ ] Database permissions hardened
- [ ] File permissions restricted

### Post-Deployment
- [ ] Service running without errors
- [ ] All modules tested
- [ ] Logs actively monitored
- [ ] Backups configured
- [ ] Update schedule established
- [ ] Incident response plan documented
- [ ] Authorization documentation secured
- [ ] Regular security updates applied

### Ongoing Maintenance
- [ ] Monthly log reviews
- [ ] Quarterly security audits
- [ ] Annual penetration testing
- [ ] Firmware updates evaluated
- [ ] Dependency updates reviewed
- [ ] Compliance verification

---

## 13. References & Resources

- [OWASP Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks/)
- [SSH Hardening Guide](https://wiki.mozilla.org/Security/Guidelines/OpenSSH)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Ubuntu Security](https://ubuntu.com/security)

---

**Security is a continuous process, not a one-time setup.**

Review this guide regularly and update security measures as new vulnerabilities are discovered.

---

**Last Review:** April 2026  
**Next Review Due:** July 2026
