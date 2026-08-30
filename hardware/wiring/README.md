# Hardware Wiring Matrix

Below is the pin connectivity diagram between the Raspberry Pi, ESP32-CAM, and sensors:

| Component | Component Pin | Raspberry Pi Pin | Description |
|-----------|---------------|------------------|-------------|
| HC-SR04 | VCC | 5V (Pin 2/4) | Power supply |
| HC-SR04 | GND | GND (Pin 6) | Ground |
| HC-SR04 | TRIG | GPIO 23 (Pin 16) | Trigger signal |
| HC-SR04 | ECHO | GPIO 24 (Pin 18) | Echo signal (via 1k/2k resistor divider) |
| Active Buzzer | VCC / SIG | GPIO 18 (Pin 12) | Audio alarm trigger |
| Active Buzzer | GND | GND (Pin 14) | Ground |
| IR Warning LED | Anode | GPIO 25 (Pin 22) | Visual alert indicator |
| IR Warning LED | Cathode | GND (Pin 20) | Ground |
