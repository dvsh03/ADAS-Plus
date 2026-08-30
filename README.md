# ADAS-Plus: Experimental Low-Cost Advanced Driver Assistance System

[![License: Restricted Use](https://img.shields.io/badge/License-Restricted%20Non--Commercial-red.svg)](LICENSE)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/)
[![YOLOv3-Tiny](https://img.shields.io/badge/Model-YOLOv3--Tiny-brightgreen.svg)](software/detection/)
[![ESP32-CAM](https://img.shields.io/badge/Hardware-ESP32--CAM-orange.svg)](firmware/esp32/)
[![Raspberry Pi](https://img.shields.io/badge/Platform-Raspberry%20Pi-red.svg)](firmware/raspberry_pi/)

**ADAS-Plus** is an open-source, experimental low-cost Advanced Driver Assistance System (ADAS) platform. It integrates real-time computer vision object detection (YOLOv3-Tiny) with embedded sensor fusion (HC-SR04 ultrasonic, HB100 Doppler radar, IR LED, and active buzzer) to deliver audio-visual collision alerts and a web-based monitoring dashboard.

---

## 📌 Features

- **Real-Time Obstacle Detection**: Powered by YOLOv3-Tiny / Ultralytics YOLO for low-latency vehicle and pedestrian detection on edge hardware.
- **Sensor Fusion**: Integrates distance measurement from HC-SR04 Ultrasonic & HB100 Doppler Radar for precise proximity estimation.
- **ESP32-CAM Live Video Stream**: High-performance HTTP MJPEG video pipeline from wireless camera nodes.
- **Audio-Visual Hazard Warning**: Real-time alerts via IR LEDs and active buzzers when safety thresholds are breached.
- **Web Dashboard**: Built-in Flask HTTP server delivering real-time annotated video stream and telemetry JSON API.

---

## 📁 Repository Structure

```text
ADAS-Plus/
│
├── README.md                  # Main project documentation
├── LICENSE                    # MIT License
├── .gitignore                 # Git ignore rules for datasets & models
├── requirements.txt           # Python dependencies
├── data.yaml                  # YOLO dataset configuration
│
├── firmware/                  # Microcontroller & Single-Board Computer Firmware
│   ├── esp32/                 # ESP32-CAM stream server code & setup
│   └── raspberry_pi/          # Raspberry Pi GPIO & sensor integration
│
├── hardware/                  # Circuit designs, wiring tables & PCBs
│   ├── schematics/            # Electrical schematic diagrams
│   ├── pcb/                   # PCB layout files
│   └── wiring/                # Pin connection matrices & guides
│
├── software/                  # Core computer vision & web app logic
│   ├── detection/             # Object detection scripts, YOLO config & training
│   └── dashboard/             # Web stream interface & telemetry server
│
├── docs/                      # Technical specification & architecture docs
│   ├── system-architecture.md # System block diagrams & dataflow
│   ├── system-design.md       # Hardware & software specs
│   ├── testing.md             # Test plans & benchmarking
│   ├── results.md             # Accuracy, precision, recall & FPS metrics
│   └── safety.md              # Safety principles & operational bounds
│
├── experiments/               # Benchmarks & model comparisons
├── media/                     # System images, circuit photos & video demos
└── examples/                  # Sample code & test scripts
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Hardware**: Raspberry Pi (3B+/4/5) or PC with Python 3.8+, ESP32-CAM module, HC-SR04 Ultrasonic Sensor, HB100 Radar, Active Buzzer.
- **Software**: Python 3.8+, OpenCV, Ultralytics PyTorch, Flask, requests, pyttsx3.

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/dvsh03/ADAS-Plus.git
cd ADAS-Plus
pip install -r requirements.txt
```

### 3. Running Obstacle Detection

Navigate to `software/detection/` and run the main application:

```bash
cd software/detection
python obstacle_detection.py
```

Open your browser and navigate to `http://localhost:5000` to view the live ADAS stream and telemetry data.

---

## 📊 Documentation

- [System Architecture](docs/system-architecture.md)
- [System Design Specification](docs/system-design.md)
- [Testing & Benchmarks](docs/testing.md)
- [Results & Performance Metrics](docs/results.md)
- [Safety & Reliability Guidelines](docs/safety.md)

---

## 👥 Authors & Team Members

- **Devesh Kumar Dilliwar**
- **Aadarsh Kumar Soni**
- **Uskrish Panchal**
- **Sahil Janghel**
- **Omi Choubey**
- **Rahul Chinchmalatpure**

---

## 📜 License

Distributed under the **ADAS+ Restricted Use License** (Free for educational/academic use; commercial use requires prior written permission). See [`LICENSE`](LICENSE) for details.
