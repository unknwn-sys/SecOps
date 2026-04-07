# Quick Start Guide for SECOPS Portal

## First Run

### 1. Run the Setup Helper (First time only)

```bash
cd ~/SecOps
chmod +x setup.sh
./setup.sh
```

This will:
- ✅ Install all dependencies
- ✅ Create necessary directories
- ✅ Initialize config file
- ✅ Test ESP32 connection

### 2. Test ESP32 Connection

If you haven't run setup.sh, test manually:

```bash
python3 test_esp32.py
```

This will scan all serial ports and test ESP32 communication.

### 3. Start the Server

```bash
python3 main.py
```

You should see:

```
✨ SECOPS Portal - Starting...
✅ Data files initialized
✅ RFID module checked
✅ ESP32 connected and ready!
✅ SECOPS Portal running!
📍 URL: http://0.0.0.0:5000
🔐 Default credentials: rynex / rynex
```

### 4. Access the Web Interface

Open your browser and go to:
- **From your Pi:** `http://localhost:5000`
- **From another computer:** `http://<your-pi-ip>:5000`

Login with:
- Username: `rynex`
- Password: `rynex`

## WiFi Scanning

### Via Web Interface

1. Navigate to "WiFi Attacks" tab
2. Click "Start Scan"
3. Wait for networks to appear

### Via Command Line (for debugging)

```bash
python3 test_esp32.py
```

## Troubleshooting

### Issue: "ESP32 not connected"

**Solution 1:** Test with the diagnostic script
```bash
python3 test_esp32.py
```

**Solution 2:** Check USB connection
```bash
# List USB devices
lsusb

# List serial ports
ls /dev/tty*

# Check which one is ESP32
dmesg | tail
```

**Solution 3:** Update config.json
```bash
# Edit data/config.json and change:
# "port": "/dev/ttyUSB0"  ← change to actual port
```

Then restart:
```bash
python3 main.py
```

### Issue: Permission denied on /dev/ttyUSB0

**Solution:**
```bash
# Add yourself to dialout group
sudo usermod -a -G dialout $(whoami)

# Apply changes (logout and back in)
newgrp dialout
```

### Issue: No networks found

1. Check ESP32 is powered
2. Check WiFi antenna is connected
3. Verify firmware uploaded correctly:
   ```bash
   python3 upload_firmware.py esp32
   ```
4. Reset ESP32 manually (press reset button)

## Running in Background

```bash
# Run in background and save log
nohup python3 main.py > secops.log 2>&1 &

# View log
tail -f secops.log

# Kill the process
pkill -f "python3 main.py"
```

## Auto-start on Boot

Create a systemd service:

```bash
sudo tee /etc/systemd/system/secops.service > /dev/null <<EOF
[Unit]
Description=SECOPS Portal
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/SecOps
ExecStart=/usr/bin/python3 $HOME/SecOps/main.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable secops
sudo systemctl start secops

# Check status
sudo systemctl status secops
```

## Usage

### WiFi Attacks Tab
- **Start Scan:** Find nearby WiFi networks
- **Select Network:** Click network to target
- **Attack Type:** Choose from:
  - Deauth (disconnect users)
  - Handshake (capture WPA handshake)
  - Evil Twin (fake network)

### HID Injection
- Create payloads (Rubber Ducky compatible)
- Execute on connected RP2040

### RFID Tab
- Currently disabled (can be re-enabled in settings)
- Placeholder for future RFID card operations

### Settings
- Configure WiFi channel and power
- Upload firmware to ESP32/RP2040
- View and manage logs

### Logs
- Real-time system activity
- All command execution history
- Errors and status updates

## Default Credentials

- **Username:** `rynex`
- **Password:** `rynex`

**⚠️ Change these in production!**

Edit in `main.py`, line ~120:
```python
if data.get('username') == 'rynex' and data.get('password') == 'rynex':
```

## Network Access

Server runs on: `http://0.0.0.0:5000`

To change port, edit `main.py` last line:
```python
socketio.run(app, host='0.0.0.0', port=8080)  # Change 5000 to 8080
```

## Support

- Check `Logs` tab in web interface
- View terminal output while running
- Use `python3 test_esp32.py` for diagnostics
- Check `data/logs.json` for detailed history
