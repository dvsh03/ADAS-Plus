# ADAS-Plus System Design Specifications

## 📐 Hardware Specifications

| Component | Specification | Function |
|-----------|---------------|----------|
| Processor | Raspberry Pi 4 Model B (4GB RAM) / PC | Main perception & computing node |
| Camera Node | ESP32-CAM (OV2640 Sensor) | Wi-Fi wireless video streaming |
| Distance Sensor | HC-SR04 Ultrasonic | Close-range distance measurement (2cm - 400cm) |
| Motion Radar | HB100 Microwave Radar | Doppler velocity sensing (10.525 GHz) |
| Indicators | IR LED & Active Buzzer | Visual and acoustic warning indicators |

## 💻 Software Specifications

- **Operating System**: Raspberry Pi OS 64-bit / Linux / Windows
- **Language**: Python 3.8+
- **CV Framework**: OpenCV 4.x, PyTorch / Ultralytics YOLO
- **Web Server**: Flask WSGI HTTP Server
