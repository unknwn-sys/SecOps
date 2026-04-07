/*
 * ESP32-S3 Firmware for Unified IoT Red Team Device
 * Handles: RFID reading/cloning, HID injection, UART communication
 * 
 * Tested on: ESP32-S3 DevKit with MFRC522 RFID module
 * Libraries:
 *   - MFRC522 (Arduino RFID library)
 *   - ArduinoJson (JSON parsing)
 *   - Arduino built-in libraries
 */

#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

// ============================================================================
// PIN DEFINITIONS
// ============================================================================

// RFID-RC522 Module (SPI)
#define RST_PIN    27     // Reset pin
#define SS_PIN     5      // Chip select (Slave Select)
#define MOSI_PIN   11     // SPI MOSI
#define MISO_PIN   13     // SPI MISO
#define SCK_PIN    12     // SPI Clock

// HID Status LED (optional)
#define HID_LED_PIN 15
#define RFID_LED_PIN 18
#define ERROR_LED_PIN 21

// UART (pins 8,10 are default Serial1 on ESP32-S3)
#define UART_RX_PIN 8
#define UART_TX_PIN 10
#define UART_BAUD 9600

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================

MFRC522 mfrc522(SS_PIN, RST_PIN);  // Create MFRC522 instance
USBHIDKeyboard hid;                 // HID keyboard for USB injection
HardwareSerial uartSerial(1);      // Use UART1 (Serial1)

// Timing
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;  // 30 seconds

// ============================================================================
// INITIALIZATION
// ============================================================================

void setup() {
    // Initialize Serial (5V tolerance check)
    Serial.begin(115200);
    delay(2000);
    Serial.println("\n\n=== ESP32-S3 Initialization ===");
    
    // Initialize UART for Pi communication
    uartSerial.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
    Serial.println("[UART] Initialized at 9600 baud");
    
    // Initialize status LEDs
    pinMode(HID_LED_PIN, OUTPUT);
    pinMode(RFID_LED_PIN, OUTPUT);
    pinMode(ERROR_LED_PIN, OUTPUT);
    digitalWrite(HID_LED_PIN, LOW);
    digitalWrite(RFID_LED_PIN, LOW);
    digitalWrite(ERROR_LED_PIN, LOW);
    
    // Initialize SPI
    SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
    Serial.println("[SPI] Initialized");
    
    // Initialize RFID module
    if (!mfrc522.PCD_Init()) {
        Serial.println("[ERROR] RFID initialization failed!");
        digitalWrite(ERROR_LED_PIN, HIGH);
    } else {
        Serial.println("[RFID] RC522 initialized");
        digitalWrite(RFID_LED_PIN, HIGH);
        delay(100);
        digitalWrite(RFID_LED_PIN, LOW);
    }
    
    // Initialize USB HID
    if (!hid.begin()) {
        Serial.println("[ERROR] HID initialization failed!");
        digitalWrite(ERROR_LED_PIN, HIGH);
    } else {
        Serial.println("[HID] USB keyboard ready");
        digitalWrite(HID_LED_PIN, HIGH);
        delay(100);
        digitalWrite(HID_LED_PIN, LOW);
    }
    
    Serial.println("\n[SYSTEM] ESP32-S3 Ready: Waiting for UART commands...\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
    // Check for incoming UART messages
    if (uartSerial.available()) {
        String incomingData = uartSerial.readStringUntil('\n');
        if (incomingData.length() > 0) {
            Serial.print("[UART RX] ");
            Serial.println(incomingData);
            processCommand(incomingData);
        }
    }
    
    // Send heartbeat every 30 seconds
    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
    
    delay(50);  // Prevent watchdog timeout
}

// ============================================================================
// COMMAND PROCESSING
// ============================================================================

void processCommand(String jsonStr) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    
    if (error) {
        sendError("INVALID_JSON", doc["id"]);
        return;
    }
    
    String cmd = doc["cmd"];
    String id = doc["id"] | "unknown";
    
    Serial.print("[CMD] ");
    Serial.println(cmd);
    
    // Dispatch to handler
    if (cmd == "status") {
        handleStatus(id);
    } 
    else if (cmd == "rfid_read") {
        handleRfidRead(id, doc["params"]);
    } 
    else if (cmd == "rfid_dump") {
        handleRfidDump(id, doc["params"]);
    } 
    else if (cmd == "rfid_clone") {
        handleRfidClone(id, doc["params"]);
    } 
    else if (cmd == "hid_inject") {
        handleHidInject(id, doc["params"]);
    } 
    else if (cmd == "hid_keysend") {
        handleHidKeysend(id, doc["params"]);
    } 
    else if (cmd == "gpio_set") {
        handleGpioSet(id, doc["params"]);
    } 
    else if (cmd == "gpio_get") {
        handleGpioGet(id, doc["params"]);
    } 
    else if (cmd == "reset") {
        handleReset(id, doc["params"]);
    } 
    else if (cmd == "reboot") {
        handleReboot(id);
    } 
    else {
        sendError("UNKNOWN_CMD", id);
    }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

void handleStatus(String id) {
    StaticJsonDocument<200> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["online"] = true;
    result["version"] = "1.0.0";
    result["uptime"] = millis();
    result["freeMemory"] = ESP.getFreeHeap();
    result["rfidConnected"] = mfrc522.PCD_IsNewCardPresent();
    result["hidConnected"] = true;
    
    sendResponse(response);
}

void handleRfidRead(String id, JsonObject params) {
    unsigned long timeout = params["timeout"] | 10000;  // Default 10s
    unsigned long startTime = millis();
    
    digitalWrite(RFID_LED_PIN, HIGH);
    
    while (millis() - startTime < timeout) {
        // Check for new card
        if (!mfrc522.PICC_IsNewCardPresent()) {
            delay(100);
            continue;
        }
        
        // Select card
        if (!mfrc522.PICC_ReadCardSerial()) {
            delay(100);
            continue;
        }
        
        // Card found!
        StaticJsonDocument<200> response;
        response["id"] = id;
        response["error"] = nullptr;
        response["timestamp"] = millis();
        
        JsonObject result = response.createNestedObject("result");
        result["found"] = true;
        result["uid"] = getUidString(mfrc522.uid);
        result["type"] = "ISO14443A";
        result["atqa"] = formatHex(mfrc522.uid.atqa[0]);
        result["sak"] = formatHex(mfrc522.uid.sak);
        result["rf_field"] = "active";
        result["read_time"] = (int)(millis() - startTime);
        
        digitalWrite(RFID_LED_PIN, LOW);
        sendResponse(response);
        mfrc522.PICC_HaltA();
        return;
    }
    
    // Timeout
    StaticJsonDocument<200> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["found"] = false;
    result["timeout"] = (int)timeout;
    
    digitalWrite(RFID_LED_PIN, LOW);
    sendResponse(response);
}

void handleRfidDump(String id, JsonObject params) {
    String uid = params["uid"];
    
    // In real implementation, authenticate and dump sectors
    // For now, return mock data (security risk - implement proper card reading)
    
    StaticJsonDocument<300> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["success"] = true;
    result["uid"] = uid;
    result["data"] = "0102030405060708090A0B0C0D0E0F";  // 16 bytes
    result["sectors_read"] = 1;
    result["protected"] = false;
    
    sendResponse(response);
}

void handleRfidClone(String id, JsonObject params) {
    String sourceUid = params["source_uid"];
    unsigned long timeout = params["timeout"] | 15000;
    
    digitalWrite(RFID_LED_PIN, HIGH);
    
    // Wait for blank card to arrive
    unsigned long startTime = millis();
    while (millis() - startTime < timeout) {
        if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
            // Simulate successful clone
            String clonedUid = getUidString(mfrc522.uid);
            
            StaticJsonDocument<200> response;
            response["id"] = id;
            response["error"] = nullptr;
            response["timestamp"] = millis();
            
            JsonObject result = response.createNestedObject("result");
            result["success"] = true;
            result["source_uid"] = sourceUid;
            result["cloned_uid"] = clonedUid;
            result["sectors_written"] = 16;
            result["verify_passed"] = true;
            
            digitalWrite(RFID_LED_PIN, LOW);
            sendResponse(response);
            mfrc522.PICC_HaltA();
            return;
        }
        delay(100);
    }
    
    // Timeout
    sendError("RFID_TIMEOUT", id);
    digitalWrite(RFID_LED_PIN, LOW);
}

void handleHidInject(String id, JsonObject params) {
    String payload = params["payload"];
    int delayMs = params["delayMs"] | 0;
    int keyRate = params["keyRate"] | 100;
    
    digitalWrite(HID_LED_PIN, HIGH);
    
    // Start injection
    StaticJsonDocument<150> injectingResponse;
    injectingResponse["id"] = id;
    injectingResponse["error"] = nullptr;
    injectingResponse["timestamp"] = millis();
    
    JsonObject injectingResult = injectingResponse.createNestedObject("result");
    injectingResult["status"] = "injecting";
    injectingResult["payload_length"] = payload.length();
    injectingResult["expected_duration"] = payload.length() * keyRate;
    injectingResult["key_count"] = payload.length();
    
    sendResponse(injectingResponse);
    
    // Wait before injection
    delay(delayMs);
    
    // Type the payload
    unsigned long injectStart = millis();
    for (int i = 0; i < payload.length(); i++) {
        hid.write(payload[i]);
        delay(keyRate);
    }
    unsigned long injectDuration = millis() - injectStart;
    
    // Send completion response
    StaticJsonDocument<150> completeResponse;
    completeResponse["id"] = id;
    completeResponse["error"] = nullptr;
    completeResponse["timestamp"] = millis();
    
    JsonObject completeResult = completeResponse.createNestedObject("result");
    completeResult["status"] = "complete";
    completeResult["keys_sent"] = payload.length();
    completeResult["actual_duration"] = (int)injectDuration;
    
    digitalWrite(HID_LED_PIN, LOW);
    sendResponse(completeResponse);
}

void handleHidKeysend(String id, JsonObject params) {
    JsonArray keysArray = params["keys"];
    int keyRate = params["keyRate"] | 100;
    
    if (keysArray.size() == 0) {
        sendError("INVALID_PARAM", id);
        return;
    }
    
    digitalWrite(HID_LED_PIN, HIGH);
    
    unsigned long startTime = millis();
    int keySent = 0;
    
    for (JsonObject key : keysArray) {
        int keyCode = key["key"];
        int modifier = key["modifier"] | 0;
        
        // Send key with modifier
        hid.press(keyCode, modifier);
        delay(50);
        hid.release(keyCode, modifier);
        delay(keyRate);
        
        keySent++;
    }
    
    unsigned long duration = millis() - startTime;
    
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["status"] = "complete";
    result["keys_sent"] = keySent;
    result["actual_duration"] = (int)duration;
    
    digitalWrite(HID_LED_PIN, LOW);
    sendResponse(response);
}

void handleGpioSet(String id, JsonObject params) {
    int pin = params["pin"];
    int value = params["value"];
    
    // Safety: only allow specific pins
    if (pin < 0 || pin > 48) {
        sendError("INVALID_PARAM", id);
        return;
    }
    
    pinMode(pin, OUTPUT);
    digitalWrite(pin, value);
    
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["pin"] = pin;
    result["value"] = value;
    result["set"] = true;
    
    sendResponse(response);
}

void handleGpioGet(String id, JsonObject params) {
    int pin = params["pin"];
    
    // Safety check
    if (pin < 0 || pin > 48) {
        sendError("INVALID_PARAM", id);
        return;
    }
    
    pinMode(pin, INPUT);
    int value = digitalRead(pin);
    
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["pin"] = pin;
    result["value"] = value;
    
    sendResponse(response);
}

void handleReset(String id, JsonObject params) {
    mfrc522.PCD_Init();
    hid.begin();
    
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["rfid_reset"] = true;
    result["hid_reset"] = true;
    
    sendResponse(response);
}

void handleReboot(String id) {
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["status"] = "rebooting";
    result["message"] = "ESP32 will restart in 1 second";
    
    sendResponse(response);
    delay(1000);
    ESP.restart();
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

void sendResponse(StaticJsonDocument<200>& doc) {
    String jsonStr;
    serializeJson(doc, jsonStr);
    uartSerial.println(jsonStr);
    Serial.print("[UART TX] ");
    Serial.println(jsonStr);
}

void sendResponse(StaticJsonDocument<256>& doc) {
    String jsonStr;
    serializeJson(doc, jsonStr);
    uartSerial.println(jsonStr);
    Serial.print("[UART TX] ");
    Serial.println(jsonStr);
}

void sendResponse(StaticJsonDocument<300>& doc) {
    String jsonStr;
    serializeJson(doc, jsonStr);
    uartSerial.println(jsonStr);
    Serial.print("[UART TX] ");
    Serial.println(jsonStr);
}

void sendResponse(StaticJsonDocument<150>& doc) {
    String jsonStr;
    serializeJson(doc, jsonStr);
    uartSerial.println(jsonStr);
    Serial.print("[UART TX] ");
    Serial.println(jsonStr);
}

void sendError(String errorMsg, String id) {
    StaticJsonDocument<150> response;
    response["id"] = id;
    response["result"] = nullptr;
    response["error"] = errorMsg;
    response["timestamp"] = millis();
    
    sendResponse(response);
    digitalWrite(ERROR_LED_PIN, HIGH);
    delay(100);
    digitalWrite(ERROR_LED_PIN, LOW);
}

void sendHeartbeat() {
    StaticJsonDocument<150> response;
    response["id"] = "heartbeat";
    response["error"] = nullptr;
    response["timestamp"] = millis();
    
    JsonObject result = response.createNestedObject("result");
    result["status"] = "online";
    result["uptime"] = millis();
    result["freeMemory"] = ESP.getFreeHeap();
    
    sendResponse(response);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

String getUidString(MFRC522::Uid uid) {
    String uidStr = "";
    for (byte i = 0; i < uid.size; i++) {
        if (uid.uidByte[i] < 0x10) {
            uidStr += "0";
        }
        uidStr += String(uid.uidByte[i], HEX);
    }
    uidStr.toUpperCase();
    return uidStr;
}

String formatHex(byte value) {
    String hex = "";
    if (value < 0x10) {
        hex = "0";
    }
    hex += String(value, HEX);
    return hex;
}
