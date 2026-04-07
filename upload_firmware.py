#!/usr/bin/env python3
"""
ESP32 Firmware Auto-Upload Script for Raspberry Pi Zero 2 W
Automatically compiles and uploads firmware to ESP32 using esptool.py
"""

import os
import subprocess
import sys
import time
import glob
import json

def detect_esp32_port():
    """Detect ESP32 serial port on Raspberry Pi"""
    possible_ports = [
        '/dev/ttyUSB0',
        '/dev/ttyUSB1',
        '/dev/ttyACM0',
        '/dev/ttyACM1',
        '/dev/ttyS0',
        '/dev/ttyAMA0'
    ]
    
    for port in possible_ports:
        if os.path.exists(port):
            print(f"✅ Found serial port: {port}")
            return port
    
    print("❌ No ESP32 serial port detected!")
    print("   Available ports:", glob.glob('/dev/tty*'))
    return None

def compile_firmware():
    """Compile ESP32 firmware using platformio or Arduino IDE"""
    firmware_path = os.path.join(os.path.dirname(__file__), 'esp32_firmware', 'esp32_attacks.ino')
    build_dir = os.path.join(os.path.dirname(__file__), 'esp32_firmware', 'build')
    
    if not os.path.exists(firmware_path):
        print("❌ ESP32 firmware file not found!")
        return None
    
    print("📦 Compiling firmware...")
    
    # Try platformio first (preferred)
    try:
        print("   Using PlatformIO...")
        result = subprocess.run([
            'platformio', 'run', '-d', os.path.dirname(firmware_path), '-e', 'esp32'
        ], capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            # Find the compiled binary
            elf_file = os.path.join(build_dir, 'esp32', 'firmware.elf')
            if os.path.exists(elf_file):
                print(f"✅ Firmware compiled successfully: {elf_file}")
                return elf_file
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"   PlatformIO not available, trying Arduino CLI...")
    
    # Fall back to Arduino CLI
    try:
        print("   Using Arduino CLI...")
        os.makedirs(build_dir, exist_ok=True)
        
        result = subprocess.run([
            'arduino-cli', 'compile', '--fqbn', 'esp32:esp32:esp32',
            '--build-path', build_dir,
            firmware_path
        ], capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            bin_file = os.path.join(build_dir, f"{os.path.basename(firmware_path)}.bin")
            if os.path.exists(bin_file):
                print(f"✅ Firmware compiled successfully: {bin_file}")
                return bin_file
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        print(f"   Arduino CLI not available")
    
    print("❌ Could not compile firmware. Please install platformio or arduino-cli:")
    print("   pip3 install platformio")
    print("   OR")
    print("   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh")
    return None

def upload_esp32_firmware():
    """Upload ESP32 firmware using esptool.py"""
    try:
        # Import esptool
        import esptool
    except ImportError:
        print("❌ esptool.py not found!")
        print("   Installing esptool.py...")
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'esptool'], check=True)
            import esptool
        except Exception as e:
            print(f"❌ Failed to install esptool: {e}")
            print("   Manual install: pip3 install esptool")
            return False
    
    # Detect ESP32 port
    port = detect_esp32_port()
    if not port:
        print("❌ Cannot find ESP32 device. Please check USB connection.")
        return False
    
    # Compile firmware first
    firmware_bin = compile_firmware()
    if not firmware_bin:
        return False
    
    print("📤 Uploading firmware to ESP32 via esptool...")
    
    try:
        # Prepare esptool arguments
        args = [
            '--chip', 'esp32',
            '--port', port,
            '--baud', '460800',
            '--before', 'default_reset',
            '--after', 'hard_reset',
            'write_flash',
            '-z',
            '--flash_mode', 'dio',
            '--flash_freq', '40m',
            '--flash_size', 'detect',
            '0x1000', firmware_bin
        ]
        
        print(f"   esptool arguments: {' '.join(args)}")
        
        # Run esptool
        result = subprocess.run(
            [sys.executable, '-m', 'esptool'] + args,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            print("✅ ESP32 firmware uploaded successfully!")
            print("   Device will restart automatically.")
            return True
        else:
            print(f"❌ Upload failed: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        print("❌ Upload timeout!")
        return False
    except Exception as e:
        print(f"❌ Upload error: {e}")
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