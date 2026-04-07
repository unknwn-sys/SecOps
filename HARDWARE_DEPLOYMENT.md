# Hardware Deployment Guide: Unified IoT Red Team Device

**Target Platform:** Raspberry Pi Zero 2 W + ESP32-S3 + External WiFi Adapter  
**Status:** Production Deployment  
**Last Updated:** April 2026

---

## ⚠️ ETHICAL CONSTRAINTS

This hardware is designed **EXCLUSIVELY** for:
- ✅ Authorized laboratory testing
- ✅ Educational research in controlled environments
- ✅ Defensive cybersecurity research
- ✅ Authorized penetration testing with written consent

**PROHIBITED USES:**
- ❌ Unauthorized network access
- ❌ Unauthorized WiFi scanning without permission
- ❌ Unauthorized RFID/HID attacks
- ❌ Illegal computer access or data theft
- ❌ Any use without explicit written authorization

**User Responsibility:** Ensure all operations are authorized and comply with applicable laws.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│      Raspberry Pi Zero 2 W (Control)    │
│  ┌─────────────────────────────────┐   │
│  │  Node.js Backend + Dashboard    │   │
│  │  - tRPC API Server (port 3000)  │   │
│  │  - React Frontend (SSR)         │   │
│  │  - MySQL Database               │   │
│  └─────────────────────────────────┘   │
│              ↓ UART (9600 baud)        │
│  ┌─────────────────────────────────┐   │
│  │      GPIO TX/RX (pins 8,10)     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
         ↓ USB (UART bridge)
┌──────────────────────────┐
│     ESP32-S3 (Worker)    │
│  - RFID Module (SPI)     │
│  - HID Injection (USB)   │
│  - Serial Communication  │
└──────────────────────────┘
    ↓ GPIO14,13,12 (SPI)
┌──────────────────────────┐
│   RFID-RC522 Module      │
│   (SDA, SCK, MOSI, MISO) │
└──────────────────────────┘

Separate Network:
┌──────────────────────────┐
│  External USB WiFi       │
│  Adapter (monitor mode)  │
│  - wlan1 (testing)       │
│  - wlan0 (control)       │
└──────────────────────────┘
```

---

## 📋 Hardware Requirements

### Raspberry Pi Zero 2 W
- 1.0 GHz ARM Cortex-A53 (4-core)
- 512 MB RAM
- Full-size HDMI, USB-A (via OTG), Micro USB power
- 40-pin GPIO header
- Broadcom WiFi (2.4 GHz)

### External USB WiFi Adapter (Monitor Mode Required)
- **Recommended:** Alfa WiFi USB adapter (Ralink/Realtek chipset)
- Must support `iw phy <phy> set name <name>` renaming
- Must support monitor mode (`iw <phy> set type monitor`)
- 5dBi antenna recommended for range

### ESP32-S3
- USB-C for power and UART communication
- 240 MHz dual-core processor
- SPI pins for RFID module
- GPIO for HID injection

### RFID Module
- **RC522 module** (NXP chipset)
- 13.56 MHz frequency
- SPI interface
- +5V/+3.3V flexible supply

### Additional Components
- USB-to-Serial bridge (CP2102 or CH340) for ESP32 if needed
- Breadboard + jumper wires
- 1-meter USB-A to USB-C cable (Pi to ESP32)
- Surge protection + 2A micro-USB power supply

---

## 🔧 Pre-Deployment Checklist

- [ ] Raspberry Pi Zero 2 W flashed with Ubuntu Server 24.04
- [ ] SSH access confirmed
- [ ] Static IP configured (e.g., 192.168.1.100)
- [ ] External USB WiFi adapter plugged in
- [ ] ESP32-S3 connected via USB-C
- [ ] RFID module wired to ESP32
- [ ] All GPIO connections validated
- [ ] Network isolation configured (if lab environment)

---

## 📥 STEP 1: Raspberry Pi Zero 2 W Setup

### 1.1 Ubuntu Server 24.04 Installation

**On your desktop machine:**

```bash
# Download Raspberry Pi Imager
# https://www.raspberrypi.com/software/

# Or use command line (Linux):
sudo apt install -y rpi-imager

# Flash Ubuntu 24.04 Server to microSD card
# 1. Insert microSD card
# 2. Open Raspberry Pi Imager
# 3. Select "Other general-purpose OS" → Ubuntu → Ubuntu Server 24.04 LTS (ARM64)
# 4. Select your SD card
# 5. Click "Next", enable SSH, set hostname/password
# 6. Write and wait 5-10 minutes
```

**First Boot:**
```bash
# Insert SD card into Pi
# Connect USB power + HDMI
# Wait 2 minutes for first boot

# Default credentials:
# Username: ubuntu
# Password: ubuntu (change on first login)

# Login and run updates
ssh ubuntu@ubuntu
sudo passwd ubuntu          # Change password
sudo apt update && sudo apt upgrade -y
```

### 1.2 Static IP Configuration

```bash
ssh ubuntu@ubuntu

# Edit netplan config
sudo nano /etc/netplan/99-custom.yaml
```

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
  wifis:
    wlan0:
      dhcp4: yes
      access-points:
        "YourNetwork":
          password: "YourPassword"
    wlan1:
      dhcp4: no
      # Reserved for external adapter - no IP yet
```

```bash
# Apply configuration
sudo netplan apply
ip addr show
# Verify wlan0 and wlan1 are present
```

---

## 📥 STEP 2: Node.js & Dependencies

### 2.1 Install Node.js 22 LTS

```bash
ssh ubuntu@ubuntu

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# Verify installation
node --version      # v22.x.x
npm --version       # npm 10.x

# Install pnpm
npm install -g pnpm
pnpm --version      # 10.15+
```

### 2.2 Install System Dependencies

```bash
sudo apt install -y \
  git \
  build-essential \
  python3-dev \
  libncurses-dev \
  pkg-config \
  autoconf \
  automake \
  libtool \
  sqlite3 \
  libsqlite3-dev \
  mysql-client \
  dnsmasq \
  aircrack-ng \
  arp-scan \
  hostapd \
  wpa-supplicant \
  curl \
  wget \
  vim \
  nano
```

---

## 📥 STEP 3: Database Setup (MySQL)

### Option A: Local SQLite (Development/Testing)

```bash
# Drizzle ORM can use SQLite for dev
# Update .env to use SQLite
DATABASE_URL="file:./dev.db"
```

### Option B: Remote MySQL (Production)

```bash
# On your Pi, create a database:
mysql -h <mysql-host> -u root -p

# In MySQL:
CREATE DATABASE offensive_security;
CREATE USER 'app_user'@'%' IDENTIFIED BY 'Strong_Password_Here';
GRANT ALL PRIVILEGES ON offensive_security.* TO 'app_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

Update `.env`:
```bash
DATABASE_URL="mysql://app_user:Strong_Password_Here@192.168.1.50:3306/offensive_security"
```

---

## 📥 STEP 4: Clone & Deploy Application

### 4.1 Clone Repository

```bash
cd /opt/
sudo mkdir -p offensive-security-portal
sudo chown ubuntu:ubuntu offensive-security-portal

git clone <your-repo-url> /opt/offensive-security-portal
cd /opt/offensive-security-portal
```

### 4.2 Install Dependencies

```bash
pnpm install

# For ARM64 (RPi), rebuild native modules
pnpm rebuild
```

### 4.3 Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required .env values:**

```bash
# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$(openssl passwd -bcrypt -quiet <<< "your_strong_password")
JWT_SECRET=your-super-secret-random-key-min-32-chars

# Database (SQLite for dev, MySQL for production)
DATABASE_URL="file:./data/dev.db"

# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Hardware Ports
UART_PORT=/dev/ttyUSB0
UART_BAUDRATE=9600

# Logging
LOG_LEVEL=info
```

### 4.4 Build & Setup Database

```bash
# Build frontend + backend
pnpm build

# Initialize database
pnpm db:push

# Verify build
ls -la dist/
```

---

## 📥 STEP 5: ESP32-S3 Firmware

### 5.1 Arduino IDE Setup

**On your desktop machine (not Pi):**

```bash
# 1. Install Arduino IDE from https://www.arduino.cc/software
# 2. Install ESP32 core:
#    - File → Preferences → Additional Boards Manager URLs
#    - Add: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
#    - Boards Manager → Search "ESP32" → Install
# 3. Select: Tools → Board → ESP32 → ESP32-S3 Dev Module
# 4. Select: Tools → Port → /dev/ttyUSB0 (or your port)
```

### 5.2 Install Required Libraries

In Arduino IDE:
- Sketch → Include Library → Manage Libraries
- Search & install:
  - `MFRC522` (by GithubCommunity) - RFID library
  - `ArduinoJson` (by Benoit Blanchon) - JSON parsing

### 5.3 Upload ESP32 Firmware

Create file: `esp32_firmware/main.ino` (see section below)

```bash
# In Arduino IDE:
# 1. Open esp32_firmware/main.ino
# 2. Verify (checkmark icon) - compiles
# 3. Upload (arrow icon)
# 4. Monitor output in Serial Monitor (115200 baud)

# Expected output:
# "ESP32-S3 Ready"
# "Waiting for UART commands..."
```

---

## 📥 STEP 6: UART Communication Protocol

See [UART_PROTOCOL.md](./UART_PROTOCOL.md) for detailed specification.

**Quick Reference:**

```json
// Raspberry Pi → ESP32
{ "cmd": "rfid_read", "timeout": 5000 }
{ "cmd": "hid_inject", "payload": "Hello World", "delayMs": 100 }
{ "cmd": "status" }

// ESP32 → Raspberry Pi
{ "rfid_uid": "A1B2C3D4", "type": "ISO14443A" }
{ "hid_status": "success", "keyCount": 15 }
{ "status": "online", "version": "1.0.0" }
```

---

## 📥 STEP 7: Run Backend Server

### 7.1 Test Run

```bash
cd /opt/offensive-security-portal

# Run in foreground (for debugging)
NODE_ENV=production node dist/index.js

# Expected output:
# ✓ Connected to database
# ✓ tRPC API listening on http://0.0.0.0:3000
# ✓ UART (/dev/ttyUSB0) initialized at 9600 baud
```

### 7.2 Access Dashboard

From your workstation:
```bash
# Find Pi's IP
ssh ubuntu@ubuntu
hostname -I

# In browser:
http://192.168.1.100:3000

# Login:
# Username: admin
# Password: (from .env ADMIN_PASSWORD_HASH)
```

---

## 📥 STEP 8: Systemd Service Setup

Create `/etc/systemd/system/offensive-security.service`:

```ini
[Unit]
Description=Offensive Security Portal
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/offensive-security-portal
Environment="NODE_ENV=production"
Environment="PORT=3000"
EnvironmentFile=/opt/offensive-security-portal/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Enable & Start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable offensive-security.service
sudo systemctl start offensive-security.service
sudo systemctl status offensive-security.service

# View logs
sudo journalctl -u offensive-security.service -f
```

---

## 📥 STEP 9: WiFi Adapter Configuration

### 9.1 Identify Adapter

```bash
# List network interfaces
ip link show
# Should see: wlan0 (onboard) and wlan1 (external)

# Check driver
iw list | grep -A5 "Capabilities"
```

### 9.2 Monitor Mode Setup

```bash
# Set external adapter to monitor mode
sudo ip link set wlan1 down
sudo iw phy phy1 set type monitor
sudo ip link set wlan1 up

# Verify
iw dev wlan1 link

# Start WiFi scanning (backend handles this)
# See server/_core/wifi.ts
```

### 9.3 Keep wlan0 for SSH Control

**Never** set wlan0 to monitor mode. It's your control network.

```bash
# Verify wlan0 stays in managed mode
iw dev wlan0 link
# Should show: "Connected to ..."
```

---

## 📥 STEP 10: Testing & Verification

### Test 1: UART Communication

```bash
# On Pi
cd /opt/offensive-security-portal

# Check UART device exists
ls -la /dev/ttyUSB*

# Test connection (manual)
cat /dev/ttyUSB0   # Watch for ESP32 messages
echo '{"cmd":"status"}' > /dev/ttyUSB0

# Backend handles this automatically
# Check logs: sudo journalctl -u offensive-security.service -f
```

### Test 2: WiFi Scanning

```bash
# Dashboard → WiFi Module → Start Scan
# Monitor logs for results
sudo journalctl -u offensive-security.service -f | grep -i wifi
```

### Test 3: RFID Reading

```bash
# Place RFID card on RC522 module
# Dashboard → RFID Module → Start Scan
# Should detect card UID in logs
```

### Test 4: HID Payload

```bash
# Dashboard → HID Module → Create Payload
# Inject simple text: "echo test"
# Check ESP32 executes via serial output
```

---

## 🔒 Security Hardening

### Firewall Rules

```bash
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow ssh
sudo ufw status

# Block external WiFi adapter from WAN
sudo iptables -A FORWARD -i wlan1 -o eth0 -j DROP
sudo iptables -A FORWARD -i eth0 -o wlan1 -j DROP
sudo iptables-save > /etc/iptables/rules.v4
```

### Disable Unnecessary Services

```bash
sudo systemctl disable avahi-daemon
sudo systemctl disable bluetooth
sudo systemctl stop bluetooth
```

### Change Default Credentials

```bash
# Already done: sudo passwd ubuntu

# Change admin password in dashboard
# Settings → Admin → Change Password
```

### Enable SSH Key Authentication

```bash
# On your workstation
ssh-keygen -t ed25519 -f ~/.ssh/rpi_key

# Copy to Pi
ssh-copy-id -i ~/.ssh/rpi_key.pub ubuntu@192.168.1.100

# Disable password auth (optional)
# sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Save and sudo systemctl restart ssh
```

---

## 📊 Monitoring & Logging

### Real-Time Logs

```bash
# Service logs
sudo journalctl -u offensive-security.service -f

# System logs
tail -f /var/log/syslog

# UART debug logs (if enabled)
tail -f /opt/offensive-security-portal/logs/uart.log
```

### Database Queries (Debug)

```bash
# Enable query logging in .env
LOG_LEVEL=debug

# View recent operations
# Dashboard → Logs → Activity Logs
```

### Hardware Status Dashboard

```
Dashboard → Hardware Health
├── Raspberry Pi
│   ├── CPU Usage
│   ├── Memory Usage
│   ├── Temperature
│   └── Last Heartbeat
├── ESP32-S3
│   ├── Status (online/offline)
│   ├── Firmware Version
│   └── Last UART Message
└── WiFi Adapter
    ├── Status
    ├── Current Mode
    └── Connected Networks
```

---

## 🐛 Troubleshooting

### Issue: Cannot connect to UART (`/dev/ttyUSB*` not found)

**Solutions:**
```bash
# Check USB connection
lsusb

# Install CH340 drivers (if needed)
sudo apt install -y ch340g

# Verify permissions
sudo usermod -a -G dialout ubuntu
# Log out and log back in

# Check dmesg
dmesg | grep -i "serial\|usb\|ch340"
```

### Issue: WiFi Adapter Not Recognized

**Solutions:**
```bash
# Install driver
sudo apt install -y rtl8812au-dkms  # For Realtek adapters

# Restart network
sudo ip link set wlan1 down
sudo ip link set wlan1 up

# Verify
iw dev
```

### Issue: Database Connection Failed

**Solutions:**
```bash
# Test MySQL connection
mysql -h <host> -u app_user -p offensive_security

# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL

# Verify MySQL is running (if local)
sudo systemctl status mysql

# Check firewall
sudo ufw status | grep 3306
```

### Issue: Out of Memory (OOM)

ESP32-S3 has limited RAM (384 KB total). Solutions:
```c
// In ESP32 firmware:
// 1. Use PSRAM if available
// 2. Use static allocations instead of dynamic
// 3. Reduce JSON buffer size
// 4. Process RFID data as stream, not all at once
```

### Issue: Pi Loses SSH Connection When WiFi Scanning

**Root Cause:** wlan1 monitor mode can interfere with wlan0

**Fix:**
```bash
# Use separate network thread for scanning
# See server/_core/wifi.ts - uses nonblocking I/O

# If still issues: increase UART timeout
UART_TIMEOUT=30000  # in .env

# Or use Ethernet for control (not WiFi)
```

---

## 📝 Production Checklist

Before deploying to restricted environment:

- [ ] All default passwords changed
- [ ] HTTPS/TLS certificates installed
- [ ] SSH key authentication enabled
- [ ] Firewall rules configured
- [ ] All logs exported
- [ ] Database backups configured
- [ ] Network isolation verified
- [ ] Hardware SN recorded
- [ ] Authorization documentation stored
- [ ] Air-gap testing completed (if required)

---

## 📚 Additional Resources

- [UART Protocol Specification](./UART_PROTOCOL.md)
- [API Documentation](./API.md)
- [Raspberry Pi Zero 2 W Specs](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)
- [ESP32-S3 Datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf)
- [MFRC522 RFID Library](https://github.com/miguelbalboa/rfid)

---

**Deployment Complete!** 🎉

Run the dashboard at `http://192.168.1.100:3000` and verify all modules are online.
