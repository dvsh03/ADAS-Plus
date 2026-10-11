# Hardware Wiring Matrix

This document defines the complete physical pin assignments between the **Raspberry Pi (Zero W / 4B)**, the wireless **ESP32-CAM** optical node, and all connected sensor/actuator peripherals.

---

## 📌 Master GPIO Pin Allocation Table (BCM)

| Peripheral | Peripheral Pin | Raspberry Pi Pin (Physical) | BCM GPIO | Electrical Notes / Signal Conditioning |
| :--- | :--- | :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | VCC | Pin 2 / Pin 4 | 5V Power | 5V DC supply rail |
| **HC-SR04 Ultrasonic** | GND | Pin 6 | GND | Common ground reference |
| **HC-SR04 Ultrasonic** | TRIG | Pin 16 | **GPIO 23** | 3.3V logic trigger pulse (10 µs HIGH) |
| **HC-SR04 Ultrasonic** | ECHO | Pin 18 | **GPIO 24** | **Requires 1kΩ / 2kΩ resistor divider** (steps down 5V echo to 3.3V safe logic) |
| **HB100 Doppler Radar** | VCC | Pin 2 / Pin 4 | 5V Power | 5V DC supply (24.125 GHz microwave oscillator) |
| **HB100 Doppler Radar** | GND | Pin 9 | GND | Common ground reference |
| **HB100 Doppler Radar** | IF / OUT | Pin 22 | **GPIO 25** | Signal amplified via LM358 dual op-amp comparator stage (3.3V digital motion pulse) |
| **850 nm IR LED Board** | VCC | External 5V / 12V | -- | High-current IR array (requires dedicated power rail) |
| **850 nm IR LED Board** | Driver IN | Pin 32 | **GPIO 12** | Active HIGH drive signal via 2N2222 NPN transistor or logic-level MOSFET |
| **850 nm IR LED Board** | GND | Pin 20 | GND | Common ground reference |
| **Active Buzzer** | VCC / SIG | Pin 12 | **GPIO 18** | Direct 3.3V active buzzer drive (or 5V with NPN switch) |
| **Active Buzzer** | GND | Pin 14 | GND | Common ground reference |

---

## ⚡ Signal Conditioning Details

### 1. HC-SR04 5V-to-3.3V Echo Voltage Divider
The Raspberry Pi GPIO header is **not 5V tolerant**. Directly connecting the HC-SR04 5V `ECHO` output to a Pi GPIO will damage the SoC. Use this standard divider:
```text
HC-SR04 ECHO (5V) ───[ 1kΩ Resistor ]───┬───> Raspberry Pi GPIO 24 (Pin 18) [3.3V safe]
                                         │
                                   [ 2kΩ Resistor ]
                                         │
                                        GND
```

### 2. HB100 Microwave Radar IF Amplification
The raw IF (Intermediate Frequency) output of an HB100 module is an extremely low-amplitude analog waveform (microvolts). It must pass through an **LM358 pre-amplifier and comparator circuit**:
- Stage 1: Active bandpass filter / amplifier (gain ~100–1000).
- Stage 2: Voltage comparator with threshold potentiometer.
- Output: Clean 0–3.3V digital pulses fed directly into **GPIO 25**.

### 3. High-Power 850 nm IR LED Switching Circuit
The 850 nm IR illuminator draws up to 300–600 mA, exceeding the maximum 16 mA current limit of a Raspberry Pi GPIO pin. It must be switched using a transistor:
```text
Raspberry Pi GPIO 12 ───[ 1kΩ Resistor ]─── Base (2N2222 / BC547)
                                              Emitter ─── GND
                                              Collector ─── IR LED Cathode (-)
                                              IR LED Anode (+) ─── +5V (External)
```

---

## 📷 ESP32-CAM Standalone Optical Node Wiring

The ESP32-CAM functions as an independent Wi-Fi camera node streaming MJPEG frames to the Raspberry Pi over local Wi-Fi:

| ESP32-CAM Pin | Connection | Notes |
| :--- | :--- | :--- |
| **5V** | External 5V (2A recommended) | ESP32-CAM Wi-Fi radio causes brownouts on weak 3.3V rails |
| **GND** | Power Supply GND | Common ground |
| **GPIO 0** | Connect to GND **during flashing** | Leave open/floating during normal operation |
| **U0TXD** | FTDI RXD (during firmware flash) | Serial programming interface |
| **U0RXD** | FTDI TXD (during firmware flash) | Serial programming interface |
