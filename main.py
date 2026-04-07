#!/usr/bin/env python3
"""
SECOPS PORTAL - Main Controller for Raspberry Pi Zero 2 W
Fully functional backend for Wi-Fi attacks and RFID operations
"""

import json
import os
import sys
import time
import threading
import serial
import subprocess
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
from functools import wraps

# RFID Library (MFRC522) - Disabled by default
rfid_reader = None
def init_rfid():
    global rfid_reader
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        if not config.get('modules', {}).get('rfid', False):
            print("⚠️ RFID module disabled in config.")
            return
        
        import RPi.GPIO as GPIO
        GPIO.setwarnings(False)  # Suppress GPIO warnings
        from mfrc522 import SimpleMFRC522
        rfid_reader = SimpleMFRC522()
        print("✅ RFID module initialized successfully.")
    except ImportError:
        rfid_reader = None
        print("⚠️ MFRC522 or RPi.GPIO not found. RFID functions disabled.")
    except Exception as e:
        rfid_reader = None
        print(f"⚠️ RFID initialization error: {e}")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secops_secret_key_2024'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Data directories
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# Files
LOG_FILE = os.path.join(DATA_DIR, "logs.json")
PAYLOAD_FILE = os.path.join(DATA_DIR, "payloads.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

# Hardware connections
esp32_serial = None

def detect_esp32_port():
    """Auto-detect ESP32 serial port"""
    import glob
    possible_ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*') + ['/dev/ttyS0', '/dev/ttyAMA0']
    
    for port in possible_ports:
        try:
            test_serial = serial.Serial(port, 115200, timeout=1)
            test_serial.close()
            return port
        except:
            continue
    return None

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Initialize data files
def init_data_files():
    for file_path, default_content in [
        (LOG_FILE, []),
        (PAYLOAD_FILE, []),
        (CONFIG_FILE, {
            'esp32': {'baudrate': 115200, 'port': '/dev/ttyS0'},
            'rfid': {'protocol': 'ISO14443A', 'enabled': True},
            'network': {'channel': 6, 'tx_power': 20, 'threads': 4},
            'modules': {'wifi': True, 'hid': True, 'rfid': True}
        })
    ]:
        if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
            with open(file_path, 'w') as f:
                json.dump(default_content, f, indent=2)

# Logging function
def log_action(action, status, details=''):
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'action': action,
        'status': status,
        'details': details
    }
    
    try:
        with open(LOG_FILE, 'r') as f:
            logs = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        logs = []
    
    logs.insert(0, log_entry)
    logs = logs[:100]
    
    with open(LOG_FILE, 'w') as f:
        json.dump(logs, f, indent=2)
    
    socketio.emit('new_log', log_entry)
    return log_entry

# Initialize serial connections
def init_serial_connections():
    global esp32_serial
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        
        # Try to connect to configured port first
        port = config['esp32'].get('port')
        
        # If port doesn't exist, auto-detect
        if not port or not os.path.exists(port):
            print(f"⚠️ Configured port {port} not found. Auto-detecting ESP32...")
            port = detect_esp32_port()
            if not port:
                log_action('ESP32 Connection', 'Failed', 'No available serial ports detected')
                esp32_serial = None
                print("❌ No ESP32 found on any serial port")
                return
            print(f"✅ Auto-detected ESP32 on {port}")
        
        esp32_serial = serial.Serial(
            port, 
            config['esp32'].get('baudrate', 115200), 
            timeout=2
        )
        log_action('ESP32 Connection', 'Success', f"Connected to {port}")
        print(f"✅ ESP32 connected on {port}")
    except Exception as e:
        log_action('ESP32 Connection', 'Failed', str(e))
        print(f"❌ ESP32 Connection Failed: {e}")
        esp32_serial = None

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    if data.get('username') == 'rynex' and data.get('password') == 'rynex':
        session['logged_in'] = True
        log_action('User Login', 'Success', 'Admin login')
        return jsonify({'success': True})
    log_action('User Login', 'Failed', 'Invalid credentials')
    return jsonify({'success': False}), 401

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return jsonify({'success': True})

# API Endpoints
@app.route('/api/system/status')
@login_required
def system_status():
    try:
        uptime = subprocess.check_output(['uptime', '-p']).decode().strip()
    except:
        uptime = "Unknown"
    
    try:
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
            cpu_temp = round(float(f.read().strip()) / 1000.0, 1)
    except:
        cpu_temp = 0.0
    
    status = {
        'system': {
            'status': 'Online',
            'uptime': uptime,
            'active_modules': 3
        },
        'esp32': {
            'status': 'Connected' if esp32_serial and esp32_serial.is_open else 'Disconnected',
            'cpu': 0, # Placeholder
            'memory': 0, # Placeholder
            'temperature': 0 # Placeholder
        },
        'pico': {
            'status': 'Online',
            'cpu': 0, # Placeholder
            'memory': 0, # Placeholder
            'temperature': cpu_temp
        },
        'rfid': {
            'status': 'Ready' if rfid_reader else 'Not Detected',
            'usage': 0
        }
    }
    return jsonify(status)

@app.route('/api/wifi/scan')
@login_required
def wifi_scan():
    if not esp32_serial:
        return jsonify({'error': 'ESP32 not connected. Please check USB connection and restart the server.'}), 500
    
    try:
        print("📡 Sending SCAN command to ESP32...")
        esp32_serial.write(b'SCAN\n')
        esp32_serial.flush()
        
        networks = []
        start_time = time.time()
        timeout = 15  # 15 second timeout
        
        while time.time() - start_time < timeout:
            if esp32_serial.in_waiting:
                try:
                    line = esp32_serial.readline().decode().strip()
                    print(f"📡 Received: {line}")
                    
                    if line == "SCAN_COMPLETE":
                        print(f"✅ Scan complete. Found {len(networks)} networks")
                        break
                    if line.startswith('NETWORK:'):
                        parts = line.split(',')
                        if len(parts) >= 6:
                            network = {
                                'ssid': parts[1],
                                'bssid': parts[2],
                                'channel': int(parts[3]),
                                'rssi': int(parts[4]),
                                'encryption': parts[5]
                            }
                            networks.append(network)
                            print(f"✅ Found network: {network['ssid']}")
                except Exception as parse_err:
                    print(f"⚠️ Parse error: {parse_err}")
                    continue
            else:
                time.sleep(0.1)  # Small delay to avoid busy-waiting
        
        if not networks and time.time() - start_time >= timeout:
            print(f"⚠️ Scan timeout after {timeout}s")
        
        log_action('WiFi Scan', 'Success', f'Found {len(networks)} networks')
        return jsonify({'networks': networks})
    except Exception as e:
        print(f"❌ WiFi Scan Error: {e}")
        log_action('WiFi Scan', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/wifi/attack', methods=['POST'])
@login_required
def wifi_attack():
    data = request.json
    attack_type = data.get('type')
    target_bssid = data.get('bssid')
    target_channel = data.get('channel')
    target_ssid = data.get('ssid', 'SecOps_Evil')
    
    if not esp32_serial:
        return jsonify({'error': 'ESP32 not connected'}), 500
    
    try:
        if attack_type == 'deauth':
            esp32_serial.write(f'DEAUTH {target_bssid},{target_channel}\n'.encode())
            log_action('Deauth Attack', 'Executed', f'Target: {target_bssid}')
        elif attack_type == 'handshake':
            esp32_serial.write(f'HANDSHAKE {target_bssid},{target_channel}\n'.encode())
            log_action('Handshake Capture', 'Started', f'Target: {target_bssid}')
        elif attack_type == 'eviltwin':
            esp32_serial.write(f'EVILTWIN {target_ssid}\n'.encode())
            log_action('Evil Twin', 'Started', f'SSID: {target_ssid}')
        else:
            return jsonify({'error': 'Invalid attack type'}), 400
        
        return jsonify({'success': True, 'message': f'{attack_type} operation initiated'})
    except Exception as e:
        log_action('WiFi Attack', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/rfid/scan')
@login_required
def rfid_scan():
    if not rfid_reader:
        # Simulation for testing if hardware not present
        uid = "DE:AD:BE:EF"
        log_action('RFID Scan (Sim)', 'Success', f'Tag UID: {uid}')
        return jsonify({'uid': uid, 'type': 'MIFARE Classic (Simulated)'})
    
    try:
        id, text = rfid_reader.read()
        uid = hex(id).upper()
        log_action('RFID Scan', 'Success', f'Tag UID: {uid}')
        return jsonify({'uid': uid, 'text': text.strip()})
    except Exception as e:
        log_action('RFID Scan', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/rfid/write', methods=['POST'])
@login_required
def rfid_write():
    data = request.json
    text = data.get('text', '')
    
    if not rfid_reader:
        return jsonify({'error': 'RFID Reader not connected'}), 500
    
    try:
        rfid_reader.write(text)
        log_action('RFID Write', 'Success', f'Data: {text}')
        return jsonify({'success': True})
    except Exception as e:
        log_action('RFID Write', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/rfid/clone', methods=['POST'])
@login_required
def rfid_clone():
    # Note: SimpleMFRC522 doesn't support full cloning of all sectors easily
    # This is a simplified version for demonstration
    return jsonify({'error': 'Full cloning requires advanced MFRC522 library features'}), 501

@app.route('/api/logs')
@login_required
def get_logs():
    try:
        with open(LOG_FILE, 'r') as f:
            logs = json.load(f)
    except:
        logs = []
    return jsonify({'logs': logs})

@app.route('/api/firmware/upload', methods=['POST'])
@login_required
def upload_firmware():
    data = request.json
    target = data.get('target', 'esp32')
    
    try:
        if target == 'esp32':
            result = subprocess.run([sys.executable, 'upload_firmware.py', 'esp32'], 
                                  capture_output=True, text=True)
        elif target == 'rp2040':
            result = subprocess.run([sys.executable, 'upload_firmware.py', 'rp2040'], 
                                  capture_output=True, text=True)
        else:
            return jsonify({'error': 'Invalid target'}), 400
        
        if result.returncode == 0:
            log_action('Firmware Upload', 'Success', f'Uploaded to {target}')
            return jsonify({'success': True, 'message': result.stdout})
        else:
            log_action('Firmware Upload', 'Failed', result.stderr)
            return jsonify({'error': result.stderr}), 500
            
    except Exception as e:
        log_action('Firmware Upload', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

# WebSocket events
@socketio.on('connect')
def handle_connect():
    emit('connected', {'data': 'Connected to SECOPS backend'})

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🔥 SECOPS Portal - Starting...")
    print("="*60)
    
    init_data_files()
    print("✅ Data files initialized")
    
    init_rfid()
    print("✅ RFID module checked")
    
    init_serial_connections()
    if esp32_serial:
        print("✅ ESP32 connected and ready!")
    else:
        print("⚠️ ESP32 not connected - WiFi features unavailable")
    
    print("\n" + "="*60)
    print("🚀 SECOPS Portal running!")
    print("📍 URL: http://0.0.0.0:5000")
    print("🔐 Default credentials: rynex / rynex")
    print("="*60 + "\n")
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
