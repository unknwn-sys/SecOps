# UART Communication Protocol

**Protocol Version:** 1.0  
**Baud Rate:** 9600  
**Data Bits:** 8  
**Stop Bits:** 1  
**Parity:** None  
**Flow Control:** None  

---

## Overview

The UART protocol defines JSON-based message exchange between:
- **Master:** Raspberry Pi (Node.js backend)
- **Slave:** ESP32-S3 firmware

All messages are newline-terminated (`\n`) and must be valid JSON.

---

## Message Structure

### Request (Pi → ESP32)

```json
{
  "id": "unique-request-id",
  "cmd": "command-name",
  "params": {}
}
```

**Fields:**
- `id` (string): Unique request identifier (UUID) for tracking
- `cmd` (string): Command name (required)
- `params` (object): Command-specific parameters

### Response (ESP32 → Pi)

```json
{
  "id": "unique-request-id",
  "result": {},
  "error": null,
  "timestamp": 1712000000000
}
```

**Fields:**
- `id` (string): Echoes request ID for correlation
- `result` (object): Command result (null on error)
- `error` (string|null): Error message if failed
- `timestamp` (number): Unix milliseconds when ESP32 processed

### Errors

On failure, response format:

```json
{
  "id": "request-id",
  "result": null,
  "error": "human_readable_error_message",
  "timestamp": 1712000000000
}
```

---

## Commands

### 1. STATUS

**Purpose:** Check ESP32 online status and firmware version.

**Request:**
```json
{
  "id": "status-001",
  "cmd": "status"
}
```

**Response (Success):**
```json
{
  "id": "status-001",
  "result": {
    "online": true,
    "version": "1.0.0",
    "uptime": 3600000,
    "freeMemory": 45000,
    "rfidConnected": true,
    "hidConnected": true
  },
  "error": null,
  "timestamp": 1712000000000
}
```

**Fields:**
- `online` (boolean): ESP32 is responsive
- `version` (string): Firmware version
- `uptime` (number): Milliseconds since boot
- `freeMemory` (number): Available RAM in bytes
- `rfidConnected` (boolean): RFID module detected
- `hidConnected` (boolean): HID injection available

---

### 2. RFID Commands

#### 2.1 RFID_READ

**Purpose:** Scan for RFID cards and return discovered UIDs.

**Request:**
```json
{
  "id": "rfid-scan-001",
  "cmd": "rfid_read",
  "params": {
    "timeout": 10000
  }
}
```

**Parameters:**
- `timeout` (number, optional): Milliseconds to scan; default 10000

**Response (Card Found):**
```json
{
  "id": "rfid-scan-001",
  "result": {
    "found": true,
    "uid": "A1B2C3D4E5F6G7H8",
    "type": "ISO14443A",
    "atqa": "0004",
    "sak": "08",
    "rf_field": "active",
    "read_time": 245
  },
  "error": null,
  "timestamp": 1712000000000
}
```

**Response (No Card):**
```json
{
  "id": "rfid-scan-001",
  "result": {
    "found": false,
    "timeout": 10000
  },
  "error": null,
  "timestamp": 1712000000000
}
```

**Fields:**
- `found` (boolean): Card detected
- `uid` (string): Card UID in hex (only if found)
- `type` (string): Card type (ISO14443A, ISO14443B, etc.)
- `atqa` (string): ATQA byte (Answer To reQuest A)
- `sak` (string): SAK byte (Select Acknowledge)
- `rf_field` (string): RF field status
- `read_time` (number): Milliseconds to detect

#### 2.2 RFID_DUMP

**Purpose:** Read and dump full card data (if accessible).

**Request:**
```json
{
  "id": "rfid-dump-001",
  "cmd": "rfid_dump",
  "params": {
    "uid": "A1B2C3D4E5F6G7H8"
  }
}
```

**Parameters:**
- `uid` (string): Card UID from previous rfid_read

**Response (Data Read):**
```json
{
  "id": "rfid-dump-001",
  "result": {
    "success": true,
    "uid": "A1B2C3D4E5F6G7H8",
    "data": "0102030405060708...",
    "sectors_read": 16,
    "protected": false
  },
  "error": null,
  "timestamp": 1712000000000
}
```

**Response (Access Denied):**
```json
{
  "id": "rfid-dump-001",
  "result": null,
  "error": "Card protected or invalid UID",
  "timestamp": 1712000000000
}
```

#### 2.3 RFID_CLONE

**Purpose:** Clone detected card data to blank card (if supported).

**Request:**
```json
{
  "id": "rfid-clone-001",
  "cmd": "rfid_clone",
  "params": {
    "source_uid": "A1B2C3D4E5F6G7H8",
    "timeout": 15000
  }
}
```

**Parameters:**
- `source_uid` (string): Card to clone from
- `timeout` (number, optional): Wait time for blank card; default 15000

**Response (Success):**
```json
{
  "id": "rfid-clone-001",
  "result": {
    "success": true,
    "source_uid": "A1B2C3D4E5F6G7H8",
    "cloned_uid": "B2C3D4E5F6G7H8I9",
    "sectors_written": 16,
    "verify_passed": true
  },
  "error": null,
  "timestamp": 1712000000000
}
```

---

### 3. HID Commands

#### 3.1 HID_INJECT

**Purpose:** Inject USB HID keystrokes.

**Request:**
```json
{
  "id": "hid-inject-001",
  "cmd": "hid_inject",
  "params": {
    "payload": "Hello, World!",
    "delayMs": 50,
    "keyRate": 100
  }
}
```

**Parameters:**
- `payload` (string): Text to inject
- `delayMs` (number, optional): Delay before injection; default 0
- `keyRate` (number, optional): Milliseconds between keypresses; default 100

**Response (Injecting):**
```json
{
  "id": "hid-inject-001",
  "result": {
    "status": "injecting",
    "payload_length": 13,
    "expected_duration": 1300,
    "key_count": 13
  },
  "error": null,
  "timestamp": 1712000000000
}
```

**Response (Complete):**
```json
{
  "id": "hid-inject-001",
  "result": {
    "status": "complete",
    "keys_sent": 13,
    "actual_duration": 1310
  },
  "error": null,
  "timestamp": 1712000000000
}
```

#### 3.2 HID_KEYSEND

**Purpose:** Send raw key codes (advanced).

**Request:**
```json
{
  "id": "hid-keys-001",
  "cmd": "hid_keysend",
  "params": {
    "keys": [
      { "key": 41, "modifier": 0 },
      { "key": 4, "modifier": 2 },
      { "key": 8, "modifier": 0 }
    ],
    "keyRate": 150
  }
}
```

**Parameters:**
- `keys` (array): Key codes with modifiers
  - `key` (number): HID key code
  - `modifier` (number): HID modifier flags (0=none, 1=Shift, 2=Ctrl, 4=Alt, 8=GUI)
- `keyRate` (number, optional): Delay between keys; default 100

**Response:**
```json
{
  "id": "hid-keys-001",
  "result": {
    "status": "complete",
    "keys_sent": 3,
    "actual_duration": 300
  },
  "error": null,
  "timestamp": 1712000000000
}
```

---

### 4. GPIO Commands

#### 4.1 GPIO_SET

**Purpose:** Control GPIO pins (debug/future use).

**Request:**
```json
{
  "id": "gpio-001",
  "cmd": "gpio_set",
  "params": {
    "pin": 12,
    "value": 1
  }
}
```

**Parameters:**
- `pin` (number): GPIO pin number
- `value` (number): 0 or 1

**Response:**
```json
{
  "id": "gpio-001",
  "result": {
    "pin": 12,
    "value": 1,
    "set": true
  },
  "error": null,
  "timestamp": 1712000000000
}
```

#### 4.2 GPIO_GET

**Purpose:** Read GPIO input.

**Request:**
```json
{
  "id": "gpio-read-001",
  "cmd": "gpio_get",
  "params": {
    "pin": 12
  }
}
```

**Response:**
```json
{
  "id": "gpio-read-001",
  "result": {
    "pin": 12,
    "value": 0
  },
  "error": null,
  "timestamp": 1712000000000
}
```

---

### 5. System Commands

#### 5.1 REBOOT

**Purpose:** Restart ESP32.

**Request:**
```json
{
  "id": "reboot-001",
  "cmd": "reboot"
}
```

**Response (Before restart):**
```json
{
  "id": "reboot-001",
  "result": {
    "status": "rebooting",
    "message": "ESP32 will restart in 1 second"
  },
  "error": null,
  "timestamp": 1712000000000
}
```

#### 5.2 RESET

**Purpose:** Reset all modules (RFID, HID).

**Request:**
```json
{
  "id": "reset-001",
  "cmd": "reset",
  "params": {
    "modules": ["rfid", "hid"]
  }
}
```

**Response:**
```json
{
  "id": "reset-001",
  "result": {
    "rfid_reset": true,
    "hid_reset": true
  },
  "error": null,
  "timestamp": 1712000000000
}
```

---

## Error Codes

| Error | Meaning | Resolution |
|-------|---------|-----------|
| `INVALID_JSON` | Message not valid JSON | Check message format |
| `UNKNOWN_CMD` | Command not recognized | Check command spelling |
| `MISSING_PARAM` | Required parameter missing | Add required param |
| `INVALID_PARAM` | Parameter wrong type/value | Check param types |
| `RFID_TIMEOUT` | Card scan timed out | Move card closer/retry |
| `RFID_READ_FAILED` | Failed to read card | Card may be protected |
| `HID_TIMEOUT` | HID inject timed out | Check USB connection |
| `HID_NOT_READY` | HID not initialized | Reboot ESP32 |
| `BUFFER_OVERFLOW` | Message too large | Reduce payload size |
| `UART_ERROR` | Serial communication error | Check cable/baudrate |

---

## Timing & Behavior

### Request Timeout

Pi waits **30 seconds** for response. After timeout:

```json
{
  "id": "timeout-request",
  "result": null,
  "error": "UART timeout: no response from ESP32",
  "timestamp": 1712000000000
}
```

### Burst Handling

Maximum **5 commands queued** on ESP32. If exceeded:

```json
{
  "id": "burst-req",
  "result": null,
  "error": "Command queue full, retry later",
  "timestamp": 1712000000000
}
```

### Long Operations

For operations like RFID dump (>1 second):

```json
{
  "id": "long-op-001",
  "result": {
    "status": "in_progress",
    "progress": 50
  },
  "error": null,
  "timestamp": 1712000000000
}
```

Then final result when complete.

---

## Example Workflow

**Scenario:** Scan for RFID card, dump data, clone to blank

### Step 1: Check ESP32 Online

```
Pi Send:   {"id":"1","cmd":"status"}
ESP32 Recv: {"id":"1",...,"online":true,...}
```

### Step 2: Start RFID Scan

```
Pi Send:   {"id":"2","cmd":"rfid_read","params":{"timeout":10000}}
ESP32 Recv: {"id":"2","result":{"found":true,"uid":"A1B2C3D4",...}}
```

### Step 3: Dump Card Data

```
Pi Send:   {"id":"3","cmd":"rfid_dump","params":{"uid":"A1B2C3D4"}}
ESP32 Recv: {"id":"3","result":{"success":true,"data":"0102030405..."}}
```

### Step 4: Clone to Blank

```
Pi Send:   {"id":"4","cmd":"rfid_clone","params":{"source_uid":"A1B2C3D4","timeout":15000}}
ESP32 Recv: {"id":"4","result":{"success":true,"cloned_uid":"B2C3D4E5",...}}
```

### Step 5: Verify Clone

```
Pi Send:   {"id":"5","cmd":"rfid_read","params":{"timeout":5000}}
ESP32 Recv: {"id":"5","result":{"found":true,"uid":"B2C3D4E5",...}}
```

---

## Testing

### Manual Testing (minicom/picocom)

```bash
# Connect to ESP32 serial port
minicom -D /dev/ttyUSB0 -b 9600

# Send command (in minicom, Ctrl-A then Z for help)
{"id":"test-1","cmd":"status"}
# Enter sends newline automatically

# Watch for response
```

### Python Testing

```python
import serial
import json
import time

ser = serial.Serial('/dev/ttyUSB0', 9600, timeout=1)

# Send status command
cmd = {"id": "py-test-1", "cmd": "status"}
ser.write((json.dumps(cmd) + '\n').encode())

# Read response
time.sleep(0.5)
response = ser.readline().decode()
print(json.loads(response))

ser.close()
```

### Backend Testing (Node.js)

See `server/_core/uart.ts` for example implementation.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04 | Initial protocol definition |

---

**Protocol Stability:** This protocol is stable for production use.
