#!/usr/bin/env python3
"""
ESP32 Firmware Auto-Upload Script
Automatically compiles and uploads firmware to ESP32
"""

import os
import subprocess
import sys
import time

def upload_esp32_firmware():
    """Upload ESP32 firmware using arduino-cli"""
    firmware_path = os.path.join(os.path.dirname(__file__), 'esp32_firmware', 'esp32_attacks.ino')

    if not os.path.exists(firmware_path):
        print("❌ ESP32 firmware file not found!")
        return False

    try:
        print("🔧 Installing ESP32 board support...")
        subprocess.run([
            'arduino-cli', 'config', 'init', '--additional-urls',
            'https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json'
        ], check=True, capture_output=True)

        subprocess.run([
            'arduino-cli', 'core', 'install', 'esp32:esp32'
        ], check=True)

        print("📦 Compiling firmware...")
        subprocess.run([
            'arduino-cli', 'compile', '--fqbn', 'esp32:esp32:esp32',
            firmware_path
        ], check=True)

        print("📤 Uploading to ESP32...")
        # Note: This assumes ESP32 is connected and port is auto-detected
        # You may need to specify the port manually
        result = subprocess.run([
            'arduino-cli', 'upload', '-p', '/dev/ttyUSB0', '--fqbn', 'esp32:esp32:esp32',
            firmware_path
        ], capture_output=True, text=True)

        if result.returncode == 0:
            print("✅ ESP32 firmware uploaded successfully!")
            return True
        else:
            print(f"❌ Upload failed: {result.stderr}")
            return False

    except subprocess.CalledProcessError as e:
        print(f"❌ Error: {e}")
        return False
    except FileNotFoundError:
        print("❌ arduino-cli not found. Please install Arduino CLI first:")
        print("   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh")
        return False

def upload_rp2040_firmware():
    """Upload RP2040 firmware"""
    uf2_path = os.path.join(os.path.dirname(__file__), 'rp2040_firmware', 'hid_inject.uf2')

    if not os.path.exists(uf2_path):
        print("❌ RP2040 firmware file not found!")
        return False

    print("🔍 Looking for RP2040 in bootloader mode...")
    print("   Put your RP2040 into bootloader mode (hold BOOTSEL while plugging in)")
    print("   Then run: cp rp2040_firmware/hid_inject.uf2 /media/$USER/RPI-RP2/")
    print("✅ RP2040 firmware ready for manual upload")

    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1].lower()
        if target == "esp32":
            upload_esp32_firmware()
        elif target == "rp2040":
            upload_rp2040_firmware()
        else:
            print("Usage: python upload_firmware.py [esp32|rp2040]")
    else:
        print("Auto-uploading firmware...")
        upload_esp32_firmware()
        upload_rp2040_firmware()