# 📋 Deployment Package Summary

Your Unified IoT Red Team Device implementation is complete. This document indexes all delivered files and their purposes.

---

## 📁 Delivered Files & Documentation

### 🚀 **Quickstart Documents**

| File | Purpose | Read First? |
|------|---------|------------|
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | **START HERE** - Complete 8-phase installation walkthrough | ✅ YES |
| [HARDWARE_DEPLOYMENT.md](./HARDWARE_DEPLOYMENT.md) | Detailed Raspberry Pi deployment with troubleshooting | After SETUP |
| [UART_PROTOCOL.md](./UART_PROTOCOL.md) | JSON UART communication protocol specification (9600 baud) | Reference |
| [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) | Security best practices and hardening guide | Pre-deployment |

### 💻 **Code Files Created**

#### Backend - UART Communication
```
server/_core/uart.ts
├─ UARTHandler class - manages ESP32 communication
├─ Message serialization & JSON parsing
├─ 30-second timeout handling
├─ Auto-reconnect with exponential backoff
└─ Heartbeat monitoring for detection
```

#### Backend - API Route Updates
```
server/routers/
├─ wifi.ts          - iwlist scanning for exter USB adapter (wlan1)
├─ rfid.ts          - UART commands to ESP32 for RFID operations
├─ hid.ts           - HID payload management & USB injection
└─ lan.ts           - arp-scan device discovery on wlan0
```

#### Backend - Initialization
```
server/_core/index.ts
├─ UART initialization (non-blocking on startup)
├─ Error handling for missing ESP32
└─ Server startup with hardware support
```

#### Firmware - ESP32-S3
```
esp32_firmware/main.ino
├─ MFRC522 RFID module support
├─ USB HID keyboard injection
├─ UART command handler (JSON-based)
├─ Status LEDs for module health
└─ Error recovery & heartbeat
```

### ⚙️ **Configuration Files**

```
.env.example
├─ Server configuration template
├─ UART port & baud rate settings
├─ JWT & password hash configuration
└─ Comments for secure setup

offensive-security.service
├─ Systemd service unit
├─ Auto-start on boot
├─ Restart policy & logging
├─ UFW (firewall) friendly
└─ Secure process isolation

package.json (updated)
├─ Added: serialport (^9.2.8)
├─ Added: @serialport/parser-readline (^9.2.8)
└─ All dependencies for hardware support
```

---

## 🔌 Hardware Architecture

```
┌─────────────────────────────────┐
│  Raspberry Pi Zero 2 W          │
│  - Ubuntu Server 24.04 LTS      │
│  - Node.js 22 LTS               │
│  - React Dashboard (3000)       │
│  - UART over /dev/ttyUSB0       │
└─────────────────────────────────┘
           ↓ USB-C Cable
┌─────────────────────────────────┐
│  ESP32-S3 Firmware              │
│         ↓                       │
│    ┌─────────────┐              │
│    │ RFID RC522  │ (SPI Port)   │
│    └─────────────┘              │
│         ↓                       │
│    ┌─────────────┐              │
│    │ HID Inject  │ (USB)        │
│    └─────────────┘              │
└─────────────────────────────────┘

Network Interfaces:
- wlan0: Control network (SSH, dashboard access)
- wlan1: Testing network (external USB adapter, monitor mode)
- eth0:  Optional local testing network
```

---

## 📝 Protocol Specifications

### UART Communication (9600 baud)

**Request Format:**
```json
{
  "id": "unique-request-id",
  "cmd": "command-name",
  "params": { "key": "value" }
}
```

**Response Format:**
```json
{
  "id": "unique-request-id",
  "result": { "data": "value" },
  "error": null,
  "timestamp": 1712000000000
}
```

**Key Commands:**
- `status` - Check ESP32 online status
- `rfid_read` - Scan for RFID cards
- `rfid_dump` - Read full card data
- `rfid_clone` - Clone card to blank
- `hid_inject` - Send keystrokes
- `gpio_set/get` - Control GPIO pins

See [UART_PROTOCOL.md](./UART_PROTOCOL.md) for complete specification.

---

## 🛠️ Installation Quick Steps

### Phase 1: Raspberry Pi Setup (30 min)
```bash
# Flash Ubuntu Server 24.04 to SD card
# (Use Raspberry Pi Imager)
# SSH in and update system
sudo apt update && sudo apt upgrade -y
```

### Phase 2: Install Dependencies (15 min)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs build-essential arp-scan aircrack-ng
npm install -g pnpm
```

### Phase 3: Deploy Application (20 min)
```bash
cd /opt/
git clone <YOUR-REPO> offensive-security-portal
cd offensive-security-portal
pnpm install && pnpm build
cp .env.example .env  # EDIT .env with your settings
```

### Phase 4: Upload ESP32 Firmware (20 min)
```
Arduino IDE
→ Install ESP32 board support
→ Install MFRC522 & ArduinoJson libraries
→ Open esp32_firmware/main.ino
→ Upload to ESP32-S3
```

### Phase 5: Setup Systemd Service (5 min)
```bash
sudo cp offensive-security.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable offensive-security.service
sudo systemctl start offensive-security.service
```

### Phase 6: Access Dashboard (5 min)
```
Browser: http://<PI_IP>:3000
Username: admin
Password: (from .env)
```

**Total Time:** ~2-3 hours for first deployment

---

## 🔒 Security Highlights

### Built-in Security
✅ JWT token-based authentication (7-day expiration)  
✅ Bcrypt password hashing (10 cost factor)  
✅ Protected API endpoints (requires login)  
✅ Activity logging for all operations  
✅ UART communication isolation from dashboard  
✅ Network interface separation (wlan0 vs wlan1)  

### Before Production
⚠️ Change all default credentials  
⚠️ Enable SSH key authentication  
⚠️ Disable SSH password auth  
⚠️ Configure UFW firewall rules  
⚠️ Verify network isolation  
⚠️ Enable systemd service auto-start  

See [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) for detailed hardening guide.

---

## 📊 API Endpoints (tRPC Routes)

### WiFi Module
```
POST /api/trpc/wifi.startScan
GET  /api/trpc/wifi.getNetworks
GET  /api/trpc/wifi.getScanStatus
POST /api/trpc/wifi.stopScan
```

### RFID Module
```
POST /api/trpc/rfid.startScan
POST /api/trpc/rfid.stopScan
POST /api/trpc/rfid.dumpTag
POST /api/trpc/rfid.cloneTag
POST /api/trpc/rfid.emulateTag
```

### HID Module
```
GET  /api/trpc/hid.listPayloads
POST /api/trpc/hid.createPayload
GET  /api/trpc/hid.getPayload
POST /api/trpc/hid.updatePayload
POST /api/trpc/hid.deletePayload
POST /api/trpc/hid.injectPayload
POST /api/trpc/hid.sendKeys
```

### LAN Module
```
POST /api/trpc/lan.startScan
POST /api/trpc/lan.stopScan
GET  /api/trpc/lan.getDiscoveredDevices
POST /api/trpc/lan.deployPayload
GET  /api/trpc/lan.probeIp
```

---

## 🔄 Module Status Tracking

All modules report status to the dashboard:

```
┌──────────────────┐
│ Module Status    │
├──────────────────┤
│ WiFi      ✓ idle │
│ RFID      ✓ idle │
│ HID       ✓ idle │
│ LAN       ✓ idle │
└──────────────────┘
```

Logs accessible at:
- Dashboard: `Settings → Activity Logs`
- Systemd: `sudo journalctl -u offensive-security.service`
- Application: `/opt/offensive-security-portal/logs/uart.log`

---

## 📦 Dependencies Installed

### Key Packages Added
```
serialport        9.2.8   - UART communication
@serialport/parser-readline 9.2.8 - Line-based message parsing
```

### Existing Packages Used
```
Express 4.21      - HTTP server
tRPC 11.6         - Type-safe APIs
Drizzle ORM       - Database abstraction
Zod               - Input validation
bcryptjs          - Password hashing
jose              - JWT token management
```

---

## 📱 Dashboard Pages

### Home
- System status overview
- Hardware health monitoring
- Recent activities

### WiFi Module
- Network discovery
- Signal strength monitoring
- Encryption detection

### RFID Module
- Card scanning
- UID detection
- Data dump & cloning

### HID Module
- Payload management
- Keystroke injection
- Macro recording (future)

### LAN Module
- Device discovery
- Port scanning
- Payload deployment

### Settings
- Admin password change
- Module configuration
- Hardware profiles

---

## 🚨 Troubleshooting Links

| Issue | Solution |
|-------|----------|
| UART not found | See [HARDWARE_DEPLOYMENT.md](./HARDWARE_DEPLOYMENT.md#troubleshooting) - Section: "Cannot connect to UART" |
| WiFi adapter error | See HARDWARE_DEPLOYMENT.md - Section: "WiFi Adapter Not Recognized" |
| Database connection failed | See HARDWARE_DEPLOYMENT.md - Section: "Database Connection Failed" |
| Out of memory | See HARDWARE_DEPLOYMENT.md - Section: "Out of Memory (OOM)" |
| SSH disconnects | See HARDWARE_DEPLOYMENT.md - Section: "Pi Loses SSH Connection" |

---

## 🎯 Next Steps

### Immediate (Today)
1. Read [SETUP_GUIDE.md](./SETUP_GUIDE.md) completely
2. Gather hardware components
3. Flash Raspberry Pi OS
4. Install Node.js & dependencies

### Short-term (This Week)
1. Deploy application to Pi
2. Upload ESP32 firmware
3. Connect hardware via UART
4. Test all modules
5. Deploy systemd service

### Medium-term (This Month)
1. Harden security (review [SECURITY_HARDENING.md](./SECURITY_HARDENING.md))
2. Configure firewall rules
3. Enable SSH key authentication
4. Setup backups
5. Obtain authorization documentation

### Long-term (Ongoing)
1. Regular security updates
2. Log monitoring & audits
3. Firmware patches
4. Dependency updates
5. Penetration testing

---

## 📞 Support & Resources

### Documentation
- [README.md](./README.md) - Project overview
- [QUICK_START.md](./QUICK_START.md) - Quick deployment
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [UART_PROTOCOL.md](./UART_PROTOCOL.md) - Protocol spec
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Step-by-step guide
- [HARDWARE_DEPLOYMENT.md](./HARDWARE_DEPLOYMENT.md) - Pi deployment
- [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) - Security guide

### External References
- [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)
- [ESP32-S3 Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/)
- [MFRC522 Library](https://github.com/miguelbalboa/rfid)
- [Arduino Setup](https://www.arduino.cc/en/Guide)

### Hardware Suppliers
- **Raspberry Pi:** [Official Pi Shop](https://shop.raspberrypi.com/)
- **ESP32-S3:** AliExpress, Digi-Key, Sparkfun
- **RFID Module:** Amazon, AdaFruit
- **USB WiFi:** Look for **Realtek/Ralink** chips with monitor mode support

---

## ✅ Verification Checklist

### Deployment Complete When:
- [ ] SSH access works (key-based auth)
- [ ] Node.js runs successfully
- [ ] Dashboard accessible at http://<IP>:3000
- [ ] UART connection established (/dev/ttyUSB0)
- [ ] ESP32 firmware flashed & responsive
- [ ] WiFi, RFID, HID, LAN modules show in dashboard
- [ ] Activity logs populated
- [ ] Systemd service running
- [ ] Firewall rules configured
- [ ] Security hardening complete
- [ ] Authorization documentation stored

---

## 🎉 Congratulations!

Your **Unified IoT Red Team Device** is now deployed and operational.

### Remember:
✅ All testing must be **authorized** in writing  
✅ Follow all applicable **laws and regulations**  
✅ Maintain comprehensive **audit trails**  
✅ Review security **regularly**  
✅ Keep **backups** of system state  

---

**This package includes:**
- ✅ Complete source code with hardware integration
- ✅ ESP32 firmware (ready to upload)
- ✅ Backend UART communication layer
- ✅ Updated API routes for hardware modules
- ✅ Systemd service configuration
- ✅ Comprehensive deployment guide (2000+ lines)
- ✅ Security hardening documentation
- ✅ UART protocol specification
- ✅ Troubleshooting guides

**Deployment Time:** 2-3 hours (first time)  
**Maintenance:** ~30 min/month for updates & audits

---

**Start with:** [SETUP_GUIDE.md](./SETUP_GUIDE.md)

Good luck with your project! 🚀
