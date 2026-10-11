# ADAS+ Standalone Hardware & Stream Verification Examples

This directory contains lightweight, standalone verification scripts to independently test each peripheral and sensor before running the end-to-end detection pipeline (`software/detection/obstacle_detection.py`).

Each script detects whether it is running on a Raspberry Pi (`RPi.GPIO`) or a development workstation (Windows / macOS / Linux PC). If GPIO libraries are unavailable, scripts automatically fall back to interactive hardware simulation so you can verify the logic without physical hardware attached.

---

## Tool Overview

| Script | Target Hardware | Purpose | Simulation Mode? |
|---|---|---|---|
| [`test_stream.py`](test_stream.py) | AI-Thinker ESP32-CAM / USB Webcam | Benchmarks MJPEG stream latency, FPS, and frame integrity | ✅ Yes (`--mock`) |
| [`test_ultrasonic.py`](test_ultrasonic.py) | HC-SR04 Ultrasonic Distance Sensor | Measures distance (2–400 cm) with 5-sample median filtering | ✅ Yes (Synthetic ranges) |
| [`test_radar.py`](test_radar.py) | HB100 10.525 GHz Doppler Radar | Detects microwave motion pulses and Doppler state transitions | ✅ Yes (Simulated motion pulses) |
| [`test_buzzer_ir.py`](test_buzzer_ir.py) | Active Buzzer & 850 nm IR LED | Exercises alert frequency chirps and night-illumination transistor drivers | ✅ Yes (Console state logger) |

---

## 1. Video Stream Latency Tester (`test_stream.py`)

Benchmarks the ESP32-CAM MJPEG stream or any USB webcam / video file, rendering a live HUD with rolling FPS and resolution.

```bash
# Test ESP32-CAM stream (default IP: 10.12.202.214:81)
python examples/test_stream.py --source http://10.12.202.214:81/stream

# Test custom ESP32 IP
python examples/test_stream.py --source http://192.168.1.105:81/stream

# Test local USB webcam
python examples/test_stream.py --source 0

# Test headless benchmark in terminal (no GUI window, e.g. SSH session)
python examples/test_stream.py --source 0 --headless --duration 10

# Synthetic mock pipeline test (no camera required)
python examples/test_stream.py --mock
```

---

## 2. Ultrasonic Sensor Verification (`test_ultrasonic.py`)

Verifies the HC-SR04 trigger (GPIO 23 / Pin 16) and echo (GPIO 24 / Pin 18 via 1kΩ / 2kΩ divider) timings.

```bash
# Standard 20-sample benchmark with 5-sample outlier rejection
python examples/test_ultrasonic.py --samples 20

# Continuous distance monitoring (exit with Ctrl+C)
python examples/test_ultrasonic.py --continuous

# Force software simulation mode on Raspberry Pi
python examples/test_ultrasonic.py --simulate
```

---

## 3. Doppler Microwave Radar Verification (`test_radar.py`)

Monitors GPIO 25 (Pin 22) connected to the HB100 IF amplifier/comparator output.

```bash
# Monitor radar pulses for 30 seconds
python examples/test_radar.py --duration 30

# High-frequency poll mode
python examples/test_radar.py --duration 15 --poll-rate 50
```

---

## 4. Actuators & Night Illuminator Verification (`test_buzzer_ir.py`)

Verifies the acoustic driver (Buzzer on GPIO 17 / Pin 11) and night vision illuminator (850 nm IR LED on GPIO 12 / Pin 32).

```bash
# Test buzzer alarm chirps (Single, Proximity Double, Critical Emergency)
python examples/test_buzzer_ir.py --test buzzer

# Test 850 nm IR LED night-illumination strobe cycle
python examples/test_buzzer_ir.py --test ir

# Test all actuators in a full diagnostic sequence
python examples/test_buzzer_ir.py --test all
```
