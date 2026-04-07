# SECOPS Troubleshooting Checklist

Use this checklist to diagnose issues with your SECOPS setup.

## 🔴 Server won't start

- [ ] Python 3.8+ installed: `python3 --version`
- [ ] Dependencies installed: `pip3 install -r requirements.txt`
- [ ] Port 5000 not in use: `lsof -i :5000` (or use different port)
- [ ] Data directory exists: `ls -la data/`
- [ ] Config file exists: `ls -la data/config.json`

**Fix:** Re-run setup.sh
```bash
./setup.sh
```

## 🔴 Can't access web interface

- [ ] Server is running: `ps aux | grep main.py`
- [ ] Using correct URL:
  - Local: `http://localhost:5000`
  - Remote: `http://<pi-ip>:5000`
- [ ] Firewall not blocking port 5000

**Fix:** Check firewall
```bash
sudo ufw allow 5000/tcp  # If using UFW
```

## 🔴 Can't login

- [ ] Using correct credentials: `rynex` / `rynex`
- [ ] Browser cookies not cached
- [ ] Try incognito/private window

**Fix:** Clear browser cache and cookies

## 🔴 ESP32 connection issues

### ESP32 Not Detected

- [ ] ESP32 connected via USB (check lsusb)
- [ ] USB cable is working (try different port/cable)
- [ ] Drivers installed (CH340 or CP210x)
- [ ] User has serial port permissions

**Quick test:**
```bash
python3 test_esp32.py
```

**Fix permissions:**
```bash
sudo usermod -a -G dialout $(whoami)
newgrp dialout  # Logout/login to apply
```

### Wrong Serial Port

- [ ] Check detected port: `python3 test_esp32.py`
- [ ] Update `data/config.json` if needed
- [ ] Restart server: `python3 main.py`

### Too many devices on USB

- [ ] Disconnect other USB devices
- [ ] Use USB hub with power supply
- [ ] Try different USB port on Pi

## 🔴 WiFi Scan not working

### No networks found

- [ ] ESP32 powered on
- [ ] WiFi antenna connected to ESP32
- [ ] ESP32 firmware uploaded: `python3 upload_firmware.py esp32`
- [ ] No errors in server log (check terminal output)

**Debug steps:**
```bash
# 1. Test ESP32 connection
python3 test_esp32.py

# 2. Re-upload firmware
python3 upload_firmware.py esp32

# 3. Check server console for errors
# (if running, Ctrl+C and restart)
python3 main.py

# 4. View detailed logs
cat data/logs.json
```

### Scan hangs or times out

- [ ] Check ESP32 is responding: `python3 test_esp32.py`
- [ ] No interference (too many WiFi networks)
- [ ] Antenna in good condition
- [ ] ESP32 not overheating

**Workaround:** Reduce scan area
```bash
# Move closer to WiFi router
# Or use less congested WiFi channel
```

### "ESP32 not connected" message

- [ ] USB cable connected
- [ ] No permission issues (see above)
- [ ] Serial port configured correctly in `data/config.json`

**Fix:**
```bash
# Test connection
python3 test_esp32.py

# Find correct port and update config
# Then restart: python3 main.py
```

## 🔴 Firmware upload fails

### Upload script errors

- [ ] esptool installed: `pip3 install esptool`
- [ ] ESP32 connected via USB
- [ ] Arduino IDE or platformio optional (but helps)

**Try manual upload:**
```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 921600 \
  write_flash -z --flash_mode dio --flash_freq 40m --flash_size detect \
  0x1000 esp32_firmware/esp32_attacks.ino.bin
```

### Connection lost during upload

- [ ] Use shorter USB cable
- [ ] Try slower baud rate
- [ ] Disable other serial connections
- [ ] Reset ESP32 before upload

## 🔴 RFID not working

- [ ] RFID module enabled in `data/config.json`: `"rfid": true`
- [ ] MFRC522 connected to SPI pins
- [ ] Antenna connected to module
- [ ] Try test: `python3 -c "from mfrc522 import SimpleMFRC522"`

**Note:** RFID disabled by default. To enable:
```bash
# Edit data/config.json and set:
# "enabled": true
# Then restart server
```

## 🔴 HID injection not working

- [ ] RP2040 connected via USB
- [ ] HID firmware flashed: `python3 upload_firmware.py rp2040`
- [ ] Payload syntax correct (Rubber Ducky format)
- [ ] Target device not locked/protected

## 📊 Getting More Information

### Check Server Logs
```bash
# Terminal output
python3 main.py  # Watch for errors

# Web interface Logs tab
# Login > Click Logs

# Detailed logs file
cat data/logs.json
```

### Check System Resources
```bash
# CPU/Memory usage
top  # Press 'q' to quit

# Disk space
df -h

# Temperature
cat /sys/class/thermal/thermal_zone0/temp  # In millidegrees Celsius
```

### Check Serial Ports
```bash
# List all ports
ls /dev/tty*

# Monitor port activity
screen /dev/ttyUSB0 115200  # Press Ctrl+A then D to exit

# Clear port locks
lsof /dev/ttyUSB0  # Find processes
kill -9 <PID>      # Kill if needed
```

## ✅ Everything Working?

Great! Now you can:

1. **Scan WiFi networks** - WiFi Attacks tab
2. **Execute attacks** - Select target and choose attack type
3. **Inject HID payloads** - HID Injection tab
4. **Monitor logs** - Logs tab
5. **Upload firmware** - Settings tab

## 🆘 Still Having Issues?

1. **Provide us with:**
   ```bash
   python3 test_esp32.py > esp32_test.log 2>&1
   
   python3 main.py > secops_debug.log 2>&1 &
   sleep 10
   kill %1
   
   cat esp32_test.log
   cat secops_debug.log
   ```

2. **Check for known issues:**
   - https://github.com/ben-slates/SecOps/issues

3. **File a new issue with:**
   - Output from test_esp32.py
   - Main.py debug output
   - What you were doing when error occurred
