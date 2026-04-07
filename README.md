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

1. Open `esp32_firmware/esp32_attacks.ino` in Arduino IDE
2. Select ESP32 board and appropriate COM port
3. Upload the firmware

The ESP32 will automatically switch to monitor mode when scanning for networks and back to promiscuous mode for attacks.

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

## Security Note

This tool is for educational and authorized security testing purposes only. Unauthorized use may violate laws and regulations.

## License

MIT License