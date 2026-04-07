#!/usr/bin/env python3
"""
ESP32 Connection and Communication Tester
Helps diagnose ESP32 serial connection and command response issues
"""

import os
import sys
import serial
import time
import glob
import json

def test_serial_ports():
    """Test all available serial ports"""
    print("\n🔍 Scanning for available serial ports...\n")
    
    possible_ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*') + ['/dev/ttyS0', '/dev/ttyAMA0']
    found_ports = [p for p in possible_ports if os.path.exists(p)]
    
    if found_ports:
        print(f"✅ Found {len(found_ports)} serial port(s):")
        for port in found_ports:
            print(f"   - {port}")
    else:
        print("❌ No serial ports found!")
        return []
    
    return found_ports

def test_esp32_connection(port, baudrate=115200):
    """Test ESP32 connection on a specific port"""
    print(f"\n🔌 Testing ESP32 on {port} at {baudrate} baud...")
    
    try:
        ser = serial.Serial(port, baudrate, timeout=2)
        print(f"✅ Serial port opened successfully: {port}")
        
        # Try sending PING command
        print(f"📡 Sending PING command...")
        ser.write(b'PING\n')
        ser.flush()
        
        response = ser.readline(timeout=3)
        if response:
            print(f"📨 Received: {response.decode('utf-8', errors='ignore').strip()}")
        else:
            print("⚠️ No response from ESP32")
        
        ser.close()
        return True
    except serial.SerialException as e:
        print(f"❌ Connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_esp32_scan(port, baudrate=115200):
    """Test WiFi scan command"""
    print(f"\n📡 Testing WiFi scan on {port}...")
    
    try:
        ser = serial.Serial(port, baudrate, timeout=2)
        print("✅ Connected to ESP32")
        
        # Send SCAN command
        print("📡 Sending SCAN command...")
        ser.write(b'SCAN\n')
        ser.flush()
        
        networks = []
        timeout = 15
        start_time = time.time()
        
        print("⏳ Waiting for scan results (max 15s)...")
        
        while time.time() - start_time < timeout:
            if ser.in_waiting:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                if line:
                    print(f"   📨 {line}")
                
                if line == "SCAN_COMPLETE":
                    print(f"\n✅ Scan complete! Found {len(networks)} networks")
                    ser.close()
                    return networks
                
                if line.startswith('NETWORK:'):
                    parts = line.split(',')
                    if len(parts) >= 6:
                        network = {
                            'ssid': parts[1],
                            'bssid': parts[2],
                            'channel': parts[3],
                            'rssi': parts[4],
                            'encryption': parts[5]
                        }
                        networks.append(network)
            else:
                time.sleep(0.1)
        
        print(f"⚠️ Scan timeout after {timeout}s")
        print(f"📊 Found {len(networks)} networks before timeout")
        ser.close()
        return networks
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    print("="*70)
    print("🔧 ESP32 Connection Tester for SECOPS Portal")
    print("="*70)
    
    # Load config
    config_file = os.path.join(os.path.dirname(__file__), 'data', 'config.json')
    config_port = None
    
    if os.path.exists(config_file):
        with open(config_file, 'r') as f:
            config = json.load(f)
        config_port = config.get('esp32', {}).get('port')
        config_baud = config.get('esp32', {}).get('baudrate', 115200)
        print(f"\n📋 Config file: {config_file}")
        print(f"   Configured port: {config_port}")
        print(f"   Configured baud: {config_baud}")
    
    # Test ports
    ports = test_serial_ports()
    
    if not ports:
        print("\n❌ No serial ports available!")
        print("\nTroubleshooting:")
        print("1. Check USB cable connection")
        print("2. Check for USB drivers (CH340, CP210x, etc.)")
        print("3. Run: lsusb  (to see connected USB devices)")
        print("4. Run: dmesg   (to see kernel messages)")
        return
    
    # Test configured port first
    if config_port and config_port in ports:
        print(f"\n🎯 Testing configured port: {config_port}")
        if test_esp32_connection(config_port, config_baud):
            # Try scan
            networks = test_esp32_scan(config_port, config_baud)
            if networks:
                print("\n📊 Networks found:")
                for net in networks:
                    print(f"   SSID: {net['ssid']:20} | Channel: {net['channel']:3} | RSSI: {net['rssi']:5}")
            return
    
    # Test other ports
    print("\n🔄 Testing other ports...")
    for port in ports:
        if config_port and port == config_port:
            continue
        
        if test_esp32_connection(port):
            print(f"\n✅ ESP32 found on {port}!")
            print(f"\n💡 Update config.json to use this port:")
            print(f'   "esp32": {{"port": "{port}", "baudrate": 115200}}')
            
            # Try scan
            networks = test_esp32_scan(port)
            if networks:
                print("\n📊 Networks found:")
                for net in networks:
                    print(f"   SSID: {net['ssid']:20} | Channel: {net['channel']:3} | RSSI: {net['rssi']:5}")
            return
    
    print("\n❌ ESP32 not responding on any port!")
    print("\nTroubleshooting:")
    print("1. Check ESP32 is powered on")
    print("2. Check USB cable is properly connected")
    print("3. Try different USB port on the Pi")
    print("4. Check USB drivers are installed")
    print("5. Try: sudo dmesg | tail  (to see connection messages)")
    print("6. Check Arduino IDE can detect the board")

if __name__ == "__main__":
    main()
