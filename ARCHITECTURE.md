# Offensive Security Portal - Architecture & Design

## System Overview

The Offensive Security Portal is a multi-module security research platform providing centralized control and monitoring for hardware-integrated offensive security operations. The system consists of a React 19 + Express 4 + tRPC 11 stack with real-time WebSocket updates and comprehensive activity logging.

## Database Schema

### Core Tables

#### `users` (Pre-existing)
- Manages authentication and user roles (admin/user)
- Integrated with Manus OAuth

#### `modules` (New)
Tracks all offensive security modules and their configurations.

```sql
CREATE TABLE modules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL UNIQUE,
  type ENUM('wifi', 'hid', 'rfid', 'lan', 'logging') NOT NULL,
  status ENUM('idle', 'running', 'paused', 'error') DEFAULT 'idle',
  enabled BOOLEAN DEFAULT true,
  configuration JSON,
  lastExecuted TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `hardware_status` (New)
Real-time hardware health monitoring.

```sql
CREATE TABLE hardware_status (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deviceType ENUM('esp32_s3', 'raspberry_pi', 'rfid_module') NOT NULL,
  status ENUM('online', 'offline', 'error') DEFAULT 'offline',
  cpuUsage DECIMAL(5,2),
  memoryUsage DECIMAL(5,2),
  temperature DECIMAL(5,2),
  lastHeartbeat TIMESTAMP NULL,
  metadata JSON,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `activity_logs` (New)
Centralized logging for all module operations.

```sql
CREATE TABLE activity_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  moduleId INT NOT NULL,
  userId INT,
  action VARCHAR(128) NOT NULL,
  status ENUM('initiated', 'in_progress', 'completed', 'failed') NOT NULL,
  details JSON,
  output TEXT,
  startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,
  duration INT,
  FOREIGN KEY (moduleId) REFERENCES modules(id),
  FOREIGN KEY (userId) REFERENCES users(id),
  INDEX (moduleId, startedAt),
  INDEX (userId, startedAt)
);
```

#### `wifi_networks` (New)
Discovered WiFi networks for attack module.

```sql
CREATE TABLE wifi_networks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ssid VARCHAR(255) NOT NULL,
  bssid VARCHAR(17) NOT NULL UNIQUE,
  channel INT,
  signalStrength INT,
  encryption VARCHAR(64),
  lastDiscovered TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `hid_payloads` (New)
Stored HID injection payloads.

```sql
CREATE TABLE hid_payloads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  payload TEXT NOT NULL,
  keystrokes JSON,
  delayMs INT DEFAULT 100,
  createdBy INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (createdBy) REFERENCES users(id)
);
```

#### `rfid_tags` (New)
Discovered and cloned RFID tags.

```sql
CREATE TABLE rfid_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tagId VARCHAR(64) NOT NULL UNIQUE,
  tagType VARCHAR(64),
  data LONGBLOB,
  isCloned BOOLEAN DEFAULT false,
  clonedFrom INT,
  discoveredAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clonedFrom) REFERENCES rfid_tags(id)
);
```

#### `lan_devices` (New)
Discovered LAN devices for implantation module.

```sql
CREATE TABLE lan_devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ipAddress VARCHAR(45) NOT NULL UNIQUE,
  macAddress VARCHAR(17),
  hostname VARCHAR(255),
  osType VARCHAR(64),
  openPorts JSON,
  services JSON,
  discoveredAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `system_settings` (New)
Global system configuration.

```sql
CREATE TABLE system_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  key VARCHAR(128) NOT NULL UNIQUE,
  value JSON,
  description TEXT,
  updatedBy INT,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updatedBy) REFERENCES users(id)
);
```

## API Architecture (tRPC Routers)

### Router Structure

```
server/routers/
├── dashboard.ts       # Real-time status, hardware health
├── wifi.ts            # WiFi scanning, attacks, packet capture
├── hid.ts             # Payload management, execution
├── rfid.ts            # Tag operations, cloning, emulation
├── lan.ts             # Network scanning, device enumeration
├── logging.ts         # Activity logs, filtering, export
└── settings.ts        # System configuration
```

### Key Procedures

**Dashboard Router:**
- `dashboard.getSystemStatus` - Real-time system overview
- `dashboard.getHardwareHealth` - Hardware status for all devices
- `dashboard.getModuleStatus` - Active modules and their states

**WiFi Router:**
- `wifi.startScan` - Begin network scanning
- `wifi.stopScan` - Stop scanning
- `wifi.getNetworks` - List discovered networks
- `wifi.startDeauth` - Launch deauth attack
- `wifi.stopDeauth` - Stop deauth attack
- `wifi.startCapture` - Begin packet capture
- `wifi.stopCapture` - Stop packet capture

**HID Router:**
- `hid.createPayload` - Create new keystroke payload
- `hid.listPayloads` - List all payloads
- `hid.deletePayload` - Remove payload
- `hid.executePayload` - Execute keystroke injection
- `hid.stopExecution` - Stop ongoing execution

**RFID Router:**
- `rfid.startScan` - Begin tag scanning
- `rfid.stopScan` - Stop scanning
- `rfid.getTags` - List discovered tags
- `rfid.cloneTag` - Clone discovered tag
- `rfid.replayTag` - Replay cloned tag
- `rfid.emulateTag` - Emulate tag behavior

**LAN Router:**
- `lan.startScan` - Begin network scan
- `lan.stopScan` - Stop scanning
- `lan.getDevices` - List discovered devices
- `lan.deployPayload` - Deploy implant to device
- `lan.getDeviceDetails` - Detailed device information

**Logging Router:**
- `logging.getLogs` - Retrieve logs with filtering
- `logging.exportLogs` - Export logs to CSV/JSON
- `logging.clearLogs` - Clear log history
- `logging.getLogStats` - Log statistics and summaries

**Settings Router:**
- `settings.getAll` - Retrieve all settings
- `settings.update` - Update setting value
- `settings.reset` - Reset to defaults

## Frontend Architecture

### Component Structure

```
client/src/
├── components/
│   ├── DashboardLayout.tsx       # Main layout with sidebar
│   ├── StatusIndicator.tsx       # Real-time status badges
│   ├── HardwareHealthCard.tsx    # Hardware monitoring cards
│   ├── ModuleCard.tsx            # Module status cards
│   └── LogViewer.tsx             # Log display component
├── pages/
│   ├── Dashboard.tsx             # Main dashboard overview
│   ├── WiFiModule.tsx            # WiFi attack interface
│   ├── HIDModule.tsx             # HID injection interface
│   ├── RFIDModule.tsx            # RFID operations interface
│   ├── LANModule.tsx             # LAN implantation interface
│   ├── Logging.tsx               # Centralized logging
│   └── Settings.tsx              # System settings
├── hooks/
│   ├── useRealTimeStatus.ts      # WebSocket status updates
│   ├── useModuleControl.ts       # Module start/stop logic
│   └── useLogFiltering.ts        # Log filtering state
└── lib/
    └── websocket.ts              # WebSocket client setup
```

### Design System

**Color Palette (Dark Professional Theme):**
- Background: `#0f1419` (Deep navy)
- Surface: `#1a1f2e` (Slate)
- Accent: `#00d9ff` (Cyan)
- Success: `#00ff41` (Neon green)
- Warning: `#ffb800` (Amber)
- Error: `#ff3333` (Red)
- Text Primary: `#e4e6eb` (Light gray)
- Text Secondary: `#a0a9b8` (Muted gray)

**Typography:**
- Font Family: Inter, system-ui, sans-serif
- Headings: 600 weight, 1.2 line-height
- Body: 400 weight, 1.5 line-height
- Monospace: Fira Code for logs and technical output

**Component Patterns:**
- Rounded corners: 8px (standard), 12px (cards)
- Shadows: Subtle elevation with 0 2px 8px rgba(0,0,0,0.3)
- Spacing: 4px base unit (4, 8, 12, 16, 24, 32, 48)
- Transitions: 200ms ease for all interactive elements

## Real-Time Communication

### WebSocket Implementation

**Events:**
- `module:status` - Module state changes
- `hardware:update` - Hardware health updates
- `log:new` - New activity log entry
- `execution:progress` - Module execution progress
- `execution:complete` - Module execution completion

**Connection Management:**
- Auto-reconnect with exponential backoff
- Heartbeat ping every 30 seconds
- Graceful degradation to polling if WebSocket unavailable

## Security Considerations

- All procedures use `protectedProcedure` requiring authentication
- Admin-only operations restricted to `role === 'admin'`
- Activity logs capture all operations for audit trail
- Hardware communication uses secure channels (HTTPS/WSS)
- Sensitive data (payloads, credentials) encrypted at rest
- Rate limiting on module execution endpoints

## Deployment Target

**Raspberry Pi Zero 2W Specifications:**
- 1.0 GHz ARM Cortex-A53 (dual-core)
- 512 MB RAM
- Optimized for low-power operation
- Lightweight Express server with minimal overhead
- SQLite or lightweight MySQL client for database

## Performance Optimization

- Lazy-load module pages to reduce initial bundle size
- Implement virtual scrolling for large log lists
- Cache hardware status updates (5-second intervals)
- Compress WebSocket payloads
- Minify and tree-shake unused components
- Use code splitting for module-specific code

## Error Handling & Recovery

- Graceful degradation when modules unavailable
- Automatic reconnection for lost connections
- User-friendly error messages with recovery suggestions
- Comprehensive error logging for debugging
- Fallback UI states for loading/error conditions
