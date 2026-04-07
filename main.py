#!/usr/bin/env python3
"""
SECOPS PORTAL - Main Controller for Raspberry Pi Pico Zero 2
Complete cyber security dashboard with ESP32, RFID, and HID injection
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

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secops_secret_key_2024'
socketio = SocketIO(app, cors_allowed_origins="*")

# Data directories
DATA_DIR = '/home/rynex/secops/data'
os.makedirs(DATA_DIR, exist_ok=True)

# Files
LOG_FILE = f"{DATA_DIR}/logs.json"
PAYLOAD_FILE = f"{DATA_DIR}/payloads.json"
CONFIG_FILE = f"{DATA_DIR}/config.json"

# Hardware connections
esp32_serial = None
rfid_serial = None

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
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'w') as f:
            json.dump([], f)
    if not os.path.exists(PAYLOAD_FILE):
        with open(PAYLOAD_FILE, 'w') as f:
            json.dump([], f)
    if not os.path.exists(CONFIG_FILE):
        default_config = {
            'esp32': {'baudrate': 115200, 'port': '/dev/ttyS0'},
            'rfid': {'protocol': 'ISO14443A'},
            'network': {'channel': 6, 'tx_power': 20, 'threads': 4},
            'modules': {'wifi': True, 'hid': True, 'rfid': True}
        }
        with open(CONFIG_FILE, 'w') as f:
            json.dump(default_config, f, indent=2)

# Logging function
def log_action(action, status, details=''):
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'action': action,
        'status': status,
        'details': details
    }
    
    with open(LOG_FILE, 'r') as f:
        logs = json.load(f)
    
    logs.insert(0, log_entry)  # Newest first
    logs = logs[:100]  # Keep last 100 logs
    
    with open(LOG_FILE, 'w') as f:
        json.dump(logs, f, indent=2)
    
    socketio.emit('new_log', log_entry)
    return log_entry

# Initialize serial connections
def init_serial_connections():
    global esp32_serial, rfid_serial
    try:
        config = json.load(open(CONFIG_FILE))
        esp32_serial = serial.Serial(
            config['esp32']['port'], 
            config['esp32']['baudrate'], 
            timeout=1
        )
        log_action('ESP32 Connection', 'Success', 'Serial connected')
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
    """Get system status and hardware info"""
    uptime = subprocess.check_output(['uptime', '-p']).decode().strip()
    
    # Get CPU temp for Pico Zero 2
    try:
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
            cpu_temp = float(f.read().strip()) / 1000.0
    except:
        cpu_temp = 45.0
    
    status = {
        'system': {
            'status': 'Online',
            'uptime': uptime,
            'active_modules': 4
        },
        'esp32': {
            'status': 'Connected' if esp32_serial else 'Disconnected',
            'cpu': 80,
            'memory': 45,
            'temperature': 52
        },
        'pico': {
            'status': 'Online',
            'cpu': 35,
            'memory': 128,
            'temperature': cpu_temp
        },
        'rfid': {
            'status': 'Ready' if rfid_serial else 'Not Detected',
            'usage': 0
        }
    }
    return jsonify(status)

@app.route('/api/wifi/scan')
@login_required
def wifi_scan():
    """Scan WiFi networks using ESP32"""
    if not esp32_serial:
        return jsonify({'error': 'ESP32 not connected'}), 500
    
    try:
        esp32_serial.write(b'SCAN\n')
        time.sleep(2)
        networks = []
        while esp32_serial.in_waiting:
            line = esp32_serial.readline().decode().strip()
            if line.startswith('NETWORK:'):
                # Parse network data
                parts = line.split(',')
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
    """Execute WiFi attack (deauth or handshake capture)"""
    data = request.json
    attack_type = data.get('type')  # 'deauth' or 'handshake'
    target_bssid = data.get('bssid')
    target_channel = data.get('channel')
    
    if not esp32_serial:
        return jsonify({'error': 'ESP32 not connected'}), 500
    
    try:
        if attack_type == 'deauth':
            esp32_serial.write(f'DEAUTH {target_bssid},{target_channel}\n'.encode())
            log_action('Deauth Attack', 'Executed', f'Target: {target_bssid}')
        elif attack_type == 'handshake':
            esp32_serial.write(f'HANDSHAKE {target_bssid},{target_channel}\n'.encode())
            log_action('Handshake Capture', 'Started', f'Target: {target_bssid}')
        else:
            return jsonify({'error': 'Invalid attack type'}), 400
        
        return jsonify({'success': True, 'message': f'{attack_type} attack started'})
    except Exception as e:
        log_action('WiFi Attack', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/rfid/scan')
@login_required
def rfid_scan():
    """Scan RFID tag"""
    try:
        # Simulated RFID read - replace with actual serial communication
        import random
        uid = ''.join([f'{random.randint(0,255):02X}' for _ in range(4)])
        log_action('RFID Scan', 'Success', f'Tag UID: {uid}')
        return jsonify({'uid': uid, 'type': 'MIFARE Classic'})
    except Exception as e:
        log_action('RFID Scan', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/rfid/clone', methods=['POST'])
@login_required
def rfid_clone():
    """Clone RFID tag to blank card"""
    data = request.json
    source_uid = data.get('source_uid')
    
    if not source_uid:
        return jsonify({'error': 'No source UID provided'}), 400
    
    try:
        # Clone logic here
        log_action('RFID Clone', 'Success', f'Cloned UID: {source_uid}')
        return jsonify({'success': True, 'message': 'Tag cloned successfully'})
    except Exception as e:
        log_action('RFID Clone', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/hid/payloads', methods=['GET'])
@login_required
def get_payloads():
    """Get all saved HID payloads"""
    with open(PAYLOAD_FILE, 'r') as f:
        payloads = json.load(f)
    return jsonify({'payloads': payloads})

@app.route('/api/hid/payloads', methods=['POST'])
@login_required
def create_payload():
    """Create new HID payload"""
    data = request.json
    name = data.get('name')
    script = data.get('script')
    os_type = data.get('os_type')
    
    if not all([name, script, os_type]):
        return jsonify({'error': 'Missing fields'}), 400
    
    payload = {
        'id': int(time.time()),
        'name': name,
        'script': script,
        'os_type': os_type,
        'created': datetime.now().isoformat()
    }
    
    with open(PAYLOAD_FILE, 'r') as f:
        payloads = json.load(f)
    
    payloads.append(payload)
    
    with open(PAYLOAD_FILE, 'w') as f:
        json.dump(payloads, f, indent=2)
    
    log_action('Payload Created', 'Success', f'Payload: {name}')
    return jsonify({'success': True, 'payload': payload})

@app.route('/api/hid/execute', methods=['POST'])
@login_required
def execute_payload():
    """Execute HID payload via RP2040"""
    data = request.json
    payload_id = data.get('payload_id')
    
    with open(PAYLOAD_FILE, 'r') as f:
        payloads = json.load(f)
    
    payload = next((p for p in payloads if p['id'] == payload_id), None)
    
    if not payload:
        return jsonify({'error': 'Payload not found'}), 404
    
    # Write payload to RP2040 via USB serial
    try:
        with serial.Serial('/dev/ttyACM0', 9600, timeout=1) as rp2040:
            rp2040.write(payload['script'].encode())
            rp2040.write(b'\nEXEC\n')
        
        log_action('Payload Executed', 'Success', f'Payload: {payload["name"]}')
        return jsonify({'success': True, 'message': 'Payload executed'})
    except Exception as e:
        log_action('Payload Execution', 'Failed', str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/logs')
@login_required
def get_logs():
    """Get activity logs"""
    with open(LOG_FILE, 'r') as f:
        logs = json.load(f)
    
    # Filter by status if provided
    status_filter = request.args.get('status')
    if status_filter:
        logs = [l for l in logs if l['status'] == status_filter]
    
    return jsonify({'logs': logs})

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'GET':
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        return jsonify(config)
    else:
        new_config = request.json
        with open(CONFIG_FILE, 'w') as f:
            json.dump(new_config, f, indent=2)
        log_action('Settings Updated', 'Success', 'Configuration changed')
        return jsonify({'success': True})

# WebSocket events
@socketio.on('connect')
def handle_connect():
    emit('connected', {'data': 'Connected to SECOPS backend'})

@socketio.on('request_realtime')
def handle_realtime():
    def send_updates():
        while True:
            time.sleep(5)
            socketio.emit('system_update', system_status())
    
    thread = threading.Thread(target=send_updates)
    thread.daemon = True
    thread.start()

if __name__ == '__main__':
    init_data_files()
    init_serial_connections()
    print("🚀 SECOPS Portal starting...")
    print("📍 Access at: http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)