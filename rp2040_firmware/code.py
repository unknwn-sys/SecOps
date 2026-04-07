"""
SECOPS HID Injection Payload Executor for RP2040
Acts as USB HID keyboard for payload injection
"""

import time
import board
import digitalio
import usb_hid
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keyboard_layout_us import KeyboardLayoutUS
from adafruit_hid.keycode import Keycode

# LED for status
led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT

# Trigger pin from Pico
trigger = digitalio.DigitalInOut(board.GP0)
trigger.direction = digitalio.Direction.INPUT
trigger.pull = digitalio.Pull.DOWN

# Initialize keyboard
keyboard = Keyboard(usb_hid.devices)
layout = KeyboardLayoutUS(keyboard)

# Payload buffer
payload_buffer = ""
execution_pending = False

def blink_led(times, delay=0.2):
    """Blink LED to indicate status"""
    for _ in range(times):
        led.value = True
        time.sleep(delay)
        led.value = False
        time.sleep(delay)

def execute_payload(script):
    """Execute HID payload script"""
    lines = script.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        parts = line.split(' ')
        command = parts[0].upper()
        
        if command == 'DELAY':
            delay_ms = int(parts[1])
            time.sleep(delay_ms / 1000.0)
        
        elif command == 'STRING':
            text = ' '.join(parts[1:])
            layout.write(text)
        
        elif command == 'ENTER':
            keyboard.send(Keycode.ENTER)
        
        elif command == 'GUI':
            keyboard.send(Keycode.GUI)
            if len(parts) > 1:
                time.sleep(0.1)
                layout.write(parts[1])
        
        elif command == 'CTRL':
            keyboard.send(Keycode.CONTROL)
            if len(parts) > 1:
                time.sleep(0.1)
                layout.write(parts[1])
        
        elif command == 'ALT':
            keyboard.send(Keycode.ALT)
            if len(parts) > 1:
                time.sleep(0.1)
                layout.write(parts[1])
        
        elif command == 'SHIFT':
            keyboard.send(Keycode.SHIFT)
            if len(parts) > 1:
                time.sleep(0.1)
                layout.write(parts[1])
        
        elif command == 'TAB':
            keyboard.send(Keycode.TAB)
        
        elif command == 'SPACE':
            keyboard.send(Keycode.SPACE)
        
        elif command == 'BACKSPACE':
            keyboard.send(Keycode.BACKSPACE)
        
        elif command == 'DELETE':
            keyboard.send(Keycode.DELETE)
        
        elif command == 'UP':
            keyboard.send(Keycode.UP_ARROW)
        
        elif command == 'DOWN':
            keyboard.send(Keycode.DOWN_ARROW)
        
        elif command == 'LEFT':
            keyboard.send(Keycode.LEFT_ARROW)
        
        elif command == 'RIGHT':
            keyboard.send(Keycode.RIGHT_ARROW)
        
        time.sleep(0.05)  # Small delay between commands

# Main loop
blink_led(3, 0.1)  # Startup indicator

while True:
    # Check for trigger from Pico via UART
    if trigger.value and not execution_pending:
        execution_pending = True
        blink_led(1, 0.5)
        
        # Here you would read from UART the payload
        # For now, use test payload
        test_payload = """
        DELAY 1000
        STRING Hello from SECOPS HID!
        ENTER
        DELAY 500
        GUI r
        DELAY 500
        STRING cmd
        ENTER
        DELAY 1000
        STRING echo SECOPS Payload Executed
        ENTER
        """
        
        execute_payload(test_payload)
        blink_led(2, 0.2)
        execution_pending = False
    
    time.sleep(0.01)