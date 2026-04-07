#!/bin/bash
# SECOPS startup helper script
# Run this after cloning the repository

set -e

echo "🔥 SECOPS Setup Helper"
echo "===================="
echo ""

# Check Python version
echo "🐍 Checking Python version..."
python3 --version

# Check pip
echo "📦 Checking pip..."
pip3 --version

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pip3 install -r requirements.txt

# Create data directories
echo ""
echo "📁 Creating data directories..."
mkdir -p data
mkdir -p esp32_firmware/build
mkdir -p rp2040_firmware

# Initialize config if not exists
if [ ! -f data/config.json ]; then
    echo "⚙️ Initializing config file..."
    python3 -c "
import json
config = {
    'esp32': {'baudrate': 115200, 'port': '/dev/ttyUSB0'},
    'rfid': {'protocol': 'ISO14443A', 'enabled': False},
    'network': {'channel': 6, 'tx_power': 20, 'threads': 4},
    'modules': {'wifi': True, 'hid': True, 'rfid': False}
}
with open('data/config.json', 'w') as f:
    json.dump(config, f, indent=2)
"
fi

# Test ESP32
echo ""
echo "🔧 Testing ESP32 connection..."
python3 test_esp32.py

echo ""
echo "✅ Setup complete!"
echo ""
echo "📍 To start the server:"
echo "   python3 main.py"
echo ""
echo "🌐 Then open your browser to:"
echo "   http://localhost:5000"
echo ""
echo "🔐 Default credentials:"
echo "   Username: rynex"
echo "   Password: rynex"
