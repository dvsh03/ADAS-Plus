# ADAS-Plus System Design Specifications

> [!NOTE]
> Results come from the current prototype hardware and may change with future hardware.

## 📐 Hardware Specifications (Current Prototype)

| Component | Specification | Function |
|-----------|---------------|----------|
| Processor | Raspberry Pi Zero W / PC | Main perception & computing node |
| Camera Node | ESP32-CAM (OV2640 Sensor) | Wi-Fi wireless video streaming |
| Distance Sensor | HC-SR04 Ultrasonic | Close-range distance measurement (2cm - 400cm) |
| Motion Radar | HB100 Microwave Radar | Doppler velocity sensing (10.525 GHz) |
| Indicators | IR LED & Active Buzzer | Visual and acoustic warning indicators |

## 💻 Operational Specifications

- **Detection Accuracy**: 92% (evaluated on custom road hazard & animal dataset)
- **Prototype Detection Range**: About 5–6 m (system detection window for low-speed prototype demonstration) | `TODO: add test conditions for the range measurement`
- **Planned Target Range**: 100–120 m (design target for planned automotive hardware, not built or measured yet)
- **Operating System**: Raspberry Pi OS / Linux / Windows
- **Language**: Python 3.8+
- **CV Framework**: OpenCV 4.x, PyTorch / Ultralytics YOLO
- **Web Server**: Flask WSGI HTTP Server
