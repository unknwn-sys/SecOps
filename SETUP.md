# SECOPS Setup Guide for Raspberry Pi Zero 2 W

## Prerequisites

- Raspberry Pi Zero 2 W with Raspberry Pi OS
- ESP32 development board
- RP2040 (Pico) board
- USB cables
- Internet connection

## Step 1: Clone and Install

```bash
# SSH into your Raspberry Pi
ssh pi@your-pi-ip

# Clone the repository
git clone https://github.com/ben-slates/SecOps.git
cd SecOps

# Install system dependencies
sudo apt update
sudo apt install python3-pip git libffi-dev libssl-dev
```

## Step 2: Install Python Dependencies

```bash
pip3 install -r requirements.txt
```

This installs:
- **esptool** - For ESP32 firmware flashing via USB/UART
- **platformio** - For firmware compilation (optional, uses Arduino CLI as fallback)
- **Flask** - Web framework
- **pyserial** - Serial communication

## Step 3: Connect Hardware

### ESP32
- Connect via USB to Raspberry Pi
- Will auto-detect on `/dev/ttyUSB0` or `/dev/ttyUSB1`

### RP2040 (Pico)
- Connect via USB for HID injection
- Will auto-detect on `/dev/ttyACM0` or `/dev/ttyACM1`

## Step 4: Auto-Flash ESP32 Firmware

### Option A: Web Interface (Recommended)

```bash
# Start the server
python3 main.py
```

Then:
1. Open browser: `http://your-pi-ip:5000`
2. Login: `rynex` / `rynex`
3. Go to Settings → Firmware Upload
4. Click "Upload ESP32 Firmware"

### Option B: Command Line

```bash
python3 upload_firmware.py esp32
```

The script will:
- Auto-detect ESP32 USB port
- Compile `esp32_firmware/esp32_attacks.ino`
- Flash using esptool.py at 460800 baud
- Auto-restart ESP32

## Step 5: Flash RP2040 (Pico)

```bash
python3 upload_firmware.py rp2040
```

This guides you to manually upload the RP2040 firmware.

## Firmware Compilation

The system supports two compilation methods:

### 1. PlatformIO (Recommended)

```bash
pip3 install platformio
```

Automatically used if available.

### 2. Arduino CLI (Fallback)

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
```

## Running SECOPS

### Foreground (Development)

```bash
python3 main.py
```

### Background (Production)

```bash
nohup python3 main.py > secops.log &
```

Or use systemd service:

```bash
sudo tee /etc/systemd/system/secops.service > /dev/null <<EOF
[Unit]
Description=SECOPS Portal
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/SecOps
ExecStart=/usr/bin/python3 /home/pi/SecOps/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable secops
sudo systemctl start secops
```

## Troubleshooting

### ESP32 Not Detected

```bash
# List all serial ports
ls -la /dev/tty*

# If using GPIO serial:
# Enable UART in raspi-config
sudo raspi-config
# Select Interface Options → Serial Port
```

### Permission Issues

```bash
# Add user to dialout group
sudo usermod -a -G dialout pi

# Log out and back in for changes to take effect
```

### Compilation Fails

```bash
# Install build tools
sudo apt install build-essential

# Use Arduino CLI directly
arduino-cli core install esp32:esp32
arduino-cli compile --fqbn esp32:esp32:esp32 esp32_firmware/esp32_attacks.ino
```

### Port Already in Use

```bash
# If port 5000 is already in use, edit main.py:
# Change: socketio.run(app, host='0.0.0.0', port=5000)
# To: socketio.run(app, host='0.0.0.0', port=8080)
```

## Default Credentials

- Username: `rynex`
- Password: `rynex`

**Change credentials in production!**

## Network Configuration

The system listens on:
- **Address:** 0.0.0.0 (all interfaces)
- **Port:** 5000
- **URL:** `http://<pi-ip>:5000`

To change:
- Edit `main.py` line: `socketio.run(app, host='0.0.0.0', port=5000)`

## Monitoring

Check for logs:

```bash
# Real-time logs
tail -f secops.log

# Via web interface:
# Login → Logs tab

# System logs via Python
cat data/logs.json
```

## Updating Firmware

1. Modify `esp32_firmware/esp32_attacks.ino`
2. Go to Settings → Firmware Upload
3. Click "Upload ESP32 Firmware"

Or:
```bash
python3 upload_firmware.py esp32
```

## Support

For issues, check:
- Logs in web interface (Logs tab)
- Terminal output (if running in foreground)
- System logs: `data/logs.json`
