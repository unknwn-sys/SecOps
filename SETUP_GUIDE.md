# Complete Hardware Setup & Installation Guide

**Target System:** Raspberry Pi Zero 2 W + ESP32-S3 + External USB WiFi  
**Estimated Duration:** 2-3 hours (first time)  
**Difficulty:** Intermediate

---

## Phase 1: Prepare Raspberry Pi Zero 2 W (30 minutes)

### Step 1: Flash Ubuntu Server 24.04

**On your workstation:**

```bash
# 1. Download Raspberry Pi Imager
#    https://www.raspberrypi.com/software/

# 2. Flash SD card:
#    - Insert microSD card (16GB minimum)
#    - Open Raspberry Pi Imager
#    - Choose: Other general-purpose OS → Ubuntu → Ubuntu Server 24.04 LTS
#    - Select your SD card
#    - Advanced options:
#      - Enable SSH ✓
#      - Set username: ubuntu
#      - Set password: (strong password)
#      - Set hostname: offensive-security-device
#      - Configure WiFi (optional)
#    - Click Write (wait 10-15 minutes)
```

### Step 2: First Boot

```bash
# 1. Insert SD card into Raspberry Pi
# 2. Connect USB power (via micro-USB)
# 3. Connect HDMI monitor (optional, SSH works better)
# 4. Wait 2 minutes for boot

# 5. SSH from your workstation:
ssh ubuntu@offensive-security-device.local

# If .local doesn't work, find IP:
nmap -sn 192.168.1.0/24 | grep -i raspberry
ssh ubuntu@<IP>

# Default password: (what you set in Imager)

# 6. Change password:
passwd
# Enter new password twice

# 7. Update system:
sudo apt update && sudo apt upgrade -y
sudo reboot
```

---

## Phase 2: Install Dependencies (15 minutes)

### Step 3: Install Node.js 22 LTS

```bash
ssh ubuntu@offensive-security-device.local

# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# Verify
node --version      # v22.x.x
npm --version       # 10.x

# Install pnpm
npm install -g pnpm
pnpm --version
```

### Step 4: Install System Packages

```bash
# WiFi, networking, compilation tools
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
  curl \
  wget \
  vim \
  nano

# Verify critical tools
which arp-scan
which airmon-ng
which iwlist
```

---

## Phase 3: Deploy Application (20 minutes)

### Step 5: Clone & Setup Project

```bash
# Create application directory
cd /opt/
sudo mkdir -p offensive-security-portal
sudo chown ubuntu:ubuntu offensive-security-portal

cd offensive-security-portal

# Clone your repository
git clone <YOUR-REPO-URL> .

# Or copy via scp if no git:
# From your workstation:
# scp -r ./offensive-security-portal ubuntu@<IP>:/opt/

# Install dependencies
pnpm install

# Rebuild ARM64 native modules
pnpm rebuild
```

### Step 6: Configure Environment

```bash
# Copy .env template
cp .env.example .env

# Edit configuration
nano .env
```

**Critical settings in .env:**

```bash
# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<generate-bcrypt-hash>
JWT_SECRET=<generate-random-32-chars>

# Database (use SQLite for testing)
DATABASE_URL=file:./data/dev.db

# Hardware
UART_PORT=/dev/ttyUSB0
UART_BAUDRATE=9600
NODE_ENV=production
PORT=3000
```

**Generate bcrypt password hash:**

```bash
# On your Pi:
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123!', 10, (err, hash) => console.log(hash));"

# Copy the output to ADMIN_PASSWORD_HASH
```

### Step 7: Build Application

```bash
cd /opt/offensive-security-portal

# Build frontend (Vite)
pnpm build

# Expected output:
# ✓ built in 120ms
# ...client/dist/
# ...dist/index.js

# Verify outputs exist:
ls -la dist/
ls -la client/dist/
```

### Step 8: Test Run

```bash
# Run server manually (for debugging)
NODE_ENV=production node dist/index.js

# Expected output:
# ✓ UART initialized at 9600 baud
# ✓ Connected to database
# ✓ Server running on http://0.0.0.0:3000/

# Press Ctrl+C to stop
```

---

## Phase 4: Hardware Integration (45 minutes)

### Step 9: ESP32 Firmware Upload

**On your workstation (with Arduino IDE):**

```bash
# 1. Install Arduino IDE
#    https://www.arduino.cc/software

# 2. Add ESP32 board support:
#    File → Preferences → Additional Boards Manager URLs
#    Add: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

# 3. Install libraries (Sketch → Include Library → Manage Libraries):
#    - MFRC522 (by GithubCommunity)
#    - ArduinoJson (by Benoit Blanchon)

# 4. Configure for ESP32-S3:
#    Tools → Board → ESP32 → ESP32-S3 Dev Module
#    Tools → Port → /dev/ttyUSB0 (or your port)

# 5. Connect ESP32 to your PC via USB-C cable

# 6. Open: /opt/offensive-security-portal/esp32_firmware/main.ino
#    In the Arduino IDE

# 7. Click Verify (checkmark) to compile

# 8. Click Upload (arrow) to flash

# 9. Open Serial Monitor (Tools → Serial Monitor)
#    Set baud rate: 115200
#    
# Expected output:
# === ESP32-S3 Initialization ===
# [UART] Initialized at 9600 baud
# [RFID] RC522 initialized
# [HID] USB keyboard ready
# [SYSTEM] ESP32-S3 Ready: Waiting for UART commands...
```

### Step 10: Connect ESP32 to Raspberry Pi

**Hardware wiring:**

```
ESP32-S3         Raspberry Pi
PIN 1 (GND)  →   PIN 6 (GND)
PIN 2 (5V)   →   PIN 2 (5V)
PIN 43 (U0RX) → PIN 8 (UART TX)
PIN 44 (U0TX) → PIN 10 (UART RX)
```

**Connect via USB:**
- USB-C cable from ESP32 to Raspberry Pi USB port
- Provides both power and serial communication

### Step 11: Verify UART Connection

```bash
ssh ubuntu@offensive-security-device.local

# Check USB device appears
ls -la /dev/ttyUSB*

# If not listed:
# Check dmesg
dmesg | tail -20

# Install CH340 driver if needed
sudo apt install -y ch340

# Add user to dialout group
sudo usermod -a -G dialout ubuntu
# Log out and back in for this to take effect

# Test connection (press Ctrl+C after 2 seconds):
cat /dev/ttyUSB0

# Should see ESP32 heartbeat messages:
# {"id":"heartbeat","result":{"status":"online","uptime":1234}...}
```

### Step 12: Wire RFID Module to ESP32

```
RC522 Module    ESP32-S3
GND        →    GND (pin 11, 19, 38)
3.3V       →    3V3 (pin 2, 13)
SDA        →    GPIO 5
SCK        →    GPIO 12
MOSI       →    GPIO 11
MISO       →    GPIO 13
IRQ        →    GPIO 9 (optional)
RST        →    GPIO 27
```

---

## Phase 5: Network Setup (15 minutes)

### Step 13: Configure Network Interfaces

```bash
ssh ubuntu@offensive-security-device.local

# Check current interfaces
ip link show
# Should see: wlan0 (onboard), wlan1 or eth0 (USB adapter)

# Edit netplan
sudo nano /etc/netplan/99-custom.yaml
```

**Add configuration:**

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: yes
  wifis:
    wlan0:
      dhcp4: yes
      # Set your WiFi credentials:
      access-points:
        "YourNetworkSSID":
          password: "YourPassword"
    wlan1:
      dhcp4: no
      # Keep this unconfigured for testing/monitor mode
```

```bash
# Apply configuration
sudo netplan apply

# Verify
ip addr show

# Should show wlan0 with IP, wlan1 available but unconfigured
```

### Step 14: Setup WiFi Adapter for Monitor Mode

```bash
# Identify adapter
iw dev
# Should show: wlan0 and wlan1

# Set external adapter to monitor mode for scanning
sudo ip link set wlan1 down
sudo iw phy phy1 set type monitor
sudo ip link set wlan1 up

# Verify
iw dev wlan1 link

# Note: Keep wlan0 in managed mode for SSH control!
iw dev wlan0 link
# Should show: "Connected to ..."
```

---

## Phase 6: System Launch & Testing (20 minutes)

### Step 15: Start Backend Server

```bash
ssh ubuntu@offensive-security-device.local
cd /opt/offensive-security-portal

# Run directly (for monitoring):
NODE_ENV=production node dist/index.js

# Or in background:
nohup NODE_ENV=production node dist/index.js > server.log 2>&1 &

# Check logs:
tail -f server.log

# Expected output:
# ✓ UART connected on /dev/ttyUSB0 @ 9600 baud
# ✓ tRPC API listening on http://0.0.0.0:3000
```

### Step 16: Access Dashboard

**From your workstation:**

```bash
# Find Pi IP
ping offensive-security-device.local
# or
nmap -sn 192.168.1.0/24

# Open in browser:
http://192.168.1.100:3000
# (replace 192.168.1.100 with actual IP)

# Login:
# Username: admin
# Password: (what you set in .env)
```

### Step 17: Test Each Module

**Test WiFi Module:**
```
Dashboard → WiFi Module → Start Scan
Wait 30 seconds
Should show discovered networks
```

**Test RFID Module:**
```
Dashboard → RFID Module → Start Scan
Place RFID card near RC522
Should detect card UID
```

**Test HID Module:**
```
Dashboard → HID Module → Create Payload
Name: "Test Payload"
Payload: "Hello Offensive Security"
Delay: 500ms
Save
Then: Inject Payload
(Note: requires USB target device to receive keystrokes)
```

**Test LAN Module:**
```
Dashboard → LAN Module → Start Scan
Wait 10 seconds
Should show discovered devices on network
```

### Step 18: Setup Auto-Start Service

```bash
# Copy systemd service file
sudo cp /opt/offensive-security-portal/offensive-security.service \
  /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable offensive-security.service
sudo systemctl start offensive-security.service

# Check status
sudo systemctl status offensive-security.service

# View logs in real-time
sudo journalctl -u offensive-security.service -f

# To stop:
sudo systemctl stop offensive-security.service

# To view past logs:
sudo journalctl -u offensive-security.service -n 100
```

---

## Phase 7: Security Hardening (15 minutes)

### Step 19: SSH Security

```bash
# Generate SSH key pair (on your workstation)
ssh-keygen -t ed25519 -f ~/.ssh/rpi_key

# Copy public key to Pi
ssh-copy-id -i ~/.ssh/rpi_key.pub ubuntu@192.168.1.100

# Test:
ssh -i ~/.ssh/rpi_key ubuntu@192.168.1.100
# Should not ask for password

# Disable password authentication (optional)
sudo nano /etc/ssh/sshd_config

# Set:
# PasswordAuthentication no
# PubkeyAuthentication yes

# Restart SSH:
sudo systemctl restart ssh
```

### Step 20: Firewall Setup

```bash
# Enable UFW
sudo ufw enable

# Set defaults
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (from your network only)
sudo ufw allow from 192.168.1.0/24 to any port 22

# Allow web dashboard
sudo ufw allow from 192.168.1.0/24 to any port 3000

# View rules
sudo ufw status numbered

# Disable specific rules if needed:
sudo ufw delete <number>
```

### Step 21: Change Default Credentials

```bash
# Already done: sudo passwd ubuntu

# In Dashboard:
Settings → Admin Settings → Change Password
# Enter old password, then new password, confirm
```

---

## Phase 8: Production Deployment Checklist

Before using in restricted/production environment:

- [ ] All default passwords changed
- [ ] SSH key authentication enabled, password auth disabled
- [ ] Firewall rules configured (ufw)
- [ ] HTTPS/TLS certificates installed (if accessible remotely)
- [ ] Systemd service enabled and tested
- [ ] Database backups configured
- [ ] Logs enabled and monitored
- [ ] Hardware SN recorded
- [ ] Authorization documentation stored offline
- [ ] Network isolation verified
- [ ] All modules tested successfully

---

## Troubleshooting

### Cannot connect to UART

```bash
# Check device exists
ls -la /dev/ttyUSB*

# Check permissions
groups ubuntu
# Should include "dialout"

# Install drivers
sudo apt install -y ch340

# View kernel messages
dmesg | tail -5
```

### WiFi adapter not working

```bash
# List devices
iw dev

# Check driver
lsusb
# Should list USB WiFi adapter

# Install driver (Realtek example)
sudo apt install -y rtl8812au-dkms

# Restart network
sudo systemctl restart networking
```

### Server won't start

```bash
# Check port is available
sudo lsof -i :3000

# Check logs
tail -100 /opt/offensive-security-portal/server.log

# Rebuild if needed
cd /opt/offensive-security-portal
pnpm install
pnpm build
```

### Out of memory

```bash
# Check available RAM
free -h

# Clear package cache
pnpm store prune

# If needed, use swap:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Next Steps

1. **Secure Your Device:**
   - Review [SECURITY_SETUP.md](./SECURITY_SETUP.md)
   - Enable disk encryption (if not deployed)
   - Regular security updates

2. **Extend Capabilities:**
   - Add custom payloads
   - Extend UART protocol
   - Write custom frontend components

3. **Monitor & Maintain:**
   - Review logs regularly
   - Monitor hardware health
   - Update firmware periodically

---

**Deployment Complete!** 🎉

Your Unified IoT Red Team Device is now operational. Access the dashboard at `http://<PI_IP>:3000/` with your admin credentials.

**Remember:** All testing must be authorized and compliant with applicable laws and regulations.
