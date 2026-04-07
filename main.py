#!/usr/bin/env python3
"""
SECOPS PORTAL - Main Controller for Raspberry Pi Zero 2 W
Fully functional backend for Wi-Fi attacks and RFID operations
"""

import json
import os
import time
import threading
import serial
import subprocess
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
from functools import wraps

# RFID Library (MFRC522)
try:
    from mfrc522 import SimpleMFRC522
    import RPi.GPIO as GPIO
    rfid_reader = SimpleMFRC522()
except ImportError:
    rfid_reader = None
    print("⚠️ MFRC522 or RPi.GPIO not found. RFID functions will be simulated.")

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
        esp32_serial = serial.Serial(
            config['esp32']['port'], 
            config['esp32']['baudrate'], 
            timeout=2
        )
        log_action('ESP32 Connection', 'Success', f"Connected to {config['esp32']['port']}")
    except Exception as e:
        log_action('ESP32 Connection', 'Failed', str(e))
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
        return jsonify({'error': 'ESP32 not connected'}), 500
    
    try:
        esp32_serial.write(b'SCAN\n')
        networks = []
        start_time = time.time()
        while time.time() - start_time < 10: # 10s timeout
            if esp32_serial.in_waiting:
                line = esp32_serial.readline().decode().strip()
                if line == "SCAN_COMPLETE":
                    break
                if line.startswith('NETWORK:'):
                    parts = line.split(',')
                    if len(parts) >= 6:
                        networks.append({
                            'ssid': parts[1],
                            'bssid': parts[2],
                            'channel': int(parts[3]),
                            'rssi': int(parts[4]),
                            'encryption': parts[5]
                        })
        log_action('WiFi Scan', 'Success', f'Found {len(networks)} networks')
        return jsonify({'networks': networks})
    except Exception as e:
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

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'GET':
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
            return jsonify(config)
        except:
            return jsonify({'error': 'Failed to load config'}), 500
    else:
        new_config = request.json
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump(new_config, f, indent=2)
            log_action('Settings Updated', 'Success', 'Configuration changed')
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# WebSocket events
@socketio.on('connect')
def handle_connect():
    emit('connected', {'data': 'Connected to SECOPS backend'})

if __name__ == '__main__':
    init_data_files()
    init_serial_connections()
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
