# SECOPS Portal

A comprehensive cyber security operations portal for WiFi attacks, HID injection, and RFID operations using Raspberry Pi Zero 2 W, ESP32, and RP2040.

## Features

- **WiFi Attacks**: Deauthentication, handshake capture, evil twin attacks
- **HID Injection**: Rubber ducky-style payload injection via RP2040
- **RFID Operations**: Card reading, writing, cloning, and emulation (currently disabled)
- **Real-time Monitoring**: Live system status and attack logs
- **Web Interface**: Modern cyber-themed UI with matrix rain effect

## Hardware Requirements

- Raspberry Pi Zero 2 W (main controller)
- ESP32 module (WiFi attacks)
- RP2040 (Pico) with CircuitPython (HID injection)
- MFRC522 RFID module (optional, currently disabled)

## Installation

1. Install system dependencies:
```bash
sudo apt update
sudo apt install python3 python3-pip git
```

2. Clone the repository:
```bash
git clone <repository-url>
cd SecOps
```

3. Install Python dependencies:
```bash
pip3 install -r requirements.txt
```

4. Configure hardware connections:
   - ESP32: Connected via UART (/dev/ttyS0)
   - RP2040: Connected via USB
   - RFID: SPI interface (currently disabled)

## ESP32 Firmware Setup

### Automatic Upload (Recommended for Raspberry Pi Zero 2 W)

The system uses **esptool.py** for automatic firmware flashing:

1. Install dependencies:
```bash
pip3 install -r requirements.txt
```

2. Connect ESP32 via USB to your Raspberry Pi Zero 2 W

3. Use the web interface:
   - Navigate to Settings → Firmware Upload
   - Click "Upload ESP32 Firmware"
   - The script will:
     - Auto-detect the USB port
     - Compile the firmware
     - Flash it using esptool.py

4. Or use the command line:
```bash
python3 upload_firmware.py esp32
```

### Manual Arduino IDE Upload

1. Open `esp32_firmware/esp32_attacks.ino` in Arduino IDE
2. Select ESP32 board and appropriate COM port
3. Upload the firmware

**Note:** The ESP32 will automatically switch to monitor mode when scanning for networks and back to promiscuous mode for attacks.

## RP2040 Firmware Setup

1. Flash `rp2040_firmware/hid_inject.uf2` to your RP2040
2. Copy `rp2040_firmware/code.py` to the RP2040's filesystem

## Usage

1. Start the server:
```bash
python3 main.py
```

2. Access the web interface at `http://localhost:5000`
3. Login with username: `rynex`, password: `rynex`

## Deployment on Raspberry Pi Zero 2 W

### Initial Setup

1. SSH into your Pi:
```bash
ssh pi@your-pi-ip
```

2. Clone and setup:
```bash
git clone https://github.com/ben-slates/SecOps.git
cd SecOps
pip3 install -r requirements.txt
```

3. Run the application:
```bash
python3 main.py
# Access at http://<your-pi-ip>:5000
```

### Auto-Flashing ESP32 Firmware

Once the server is running, you can upload firmware directly from the web interface or command line:

**Web Interface:**
- Login to SECOPS Portal
- Go to Settings → Firmware Upload
- Click "Upload ESP32 Firmware"

**Command Line:**
```bash
python3 upload_firmware.py esp32
```

The script will:
1. Auto-detect ESP32 USB port
2. Compile the firmware
3. Flash using esptool.py (460800 baud rate)
4. Automatically restart the ESP32

## API Endpoints

- `GET /api/system/status` - System status
- `GET /api/wifi/scan` - Scan WiFi networks
- `POST /api/wifi/attack` - Execute WiFi attacks
- `GET /api/rfid/scan` - Scan RFID cards (disabled)
- `POST /api/rfid/write` - Write RFID data (disabled)
- `GET /api/logs` - Get system logs

## Configuration

Edit `data/config.json` to modify settings:

```json
{
  "esp32": {
    "baudrate": 115200,
    "port": "/dev/ttyS0"
  },
  "rfid": {
    "protocol": "ISO14443A",
    "enabled": false
  },
  "network": {
    "channel": 6,
    "tx_power": 20,
    "threads": 4
  },
  "modules": {
    "wifi": true,
    "hid": true,
    "rfid": false
  }
}
```

## Troubleshooting

### ESP32 Not Detected

If you see "ESP32 not connected" when scanning, use the test script:

```bash
python3 test_esp32.py
```

This will:
1. Scan all serial ports
2. Attempt to connect to ESP32
3. Test WiFi scan functionality
4. Provide port detection feedback

**Manual port check:**
```bash
# List serial ports
ls /dev/tty*

# Monitor ESP32 output
screen /dev/ttyUSB0 115200
# (Press Ctrl+A then D to exit)
```

### Permission Issues

If you get "Permission denied" errors:

```bash
# Add user to dialout group
sudo usermod -a -G dialout $(whoami)

# Apply group changes (logout and log back in)
newgrp dialout
```

### ESP32 Firmware Issues

1. **Firmware won't upload:**
   - Check USB cable
   - Try different USB port
   - Manually reset ESP32

2. **Scan returns no networks:**
   - Check ESP32 antenna connection
   - Verify firmware uploaded correctly
   - Reset ESP32: `python3 test_esp32.py`

3. **Serial port conflict:**
   - Another program using the port
   - Check: `lsof /dev/ttyUSB0`
   - Kill conflicting process

### Common Ports

On Raspberry Pi:
- **USB connected ESP32:** `/dev/ttyUSB0` or `/dev/ttyUSB1`
- **GPIO serial:** `/dev/ttyS0` or `/dev/ttyAMA0`

## Security Note

This tool is for educational and authorized security testing purposes only. Unauthorized use may violate laws and regulations.

## License

MIT License