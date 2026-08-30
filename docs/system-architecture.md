# ADAS-Plus System Architecture

## 🏗️ Architectural Overview

**ADAS-Plus** follows a multi-tier edge perception architecture:

```mermaid
graph TD
    A[ESP32-CAM] -->|MJPEG Stream over Wi-Fi| B[Raspberry Pi / PC Inference Engine]
    C[HC-SR04 Ultrasonic Sensor] -->|Distance Telemetry| B
    D[HB100 Radar Module] -->|Velocity Telemetry| B
    
    subgraph Edge Perception Unit
        B -->|OpenCV / YOLOv3-Tiny| E[Object Detection Engine]
        B -->|Sensor Fusion| F[Distance & Velocity Estimator]
    end

    E --> G[Alert & Logic Controller]
    F --> G

    G -->|Danger Threshold Met| H[IR LED Warning]
    G -->|Danger Threshold Met| I[Active Buzzer Alarm]
    G -->|Live Video + Telemetry| J[Flask Web Dashboard Interface]
```

## 🧠 Data Processing Flow

1. **Video Stream Processing**: Frames are pulled from the ESP32-CAM MJPEG stream (`http://<ESP32_IP>:81/stream`), decoded using OpenCV, and resized to input resolution (192x192 / 320x240).
2. **Object Detection**: YOLOv3-Tiny predicts bounding boxes, confidence scores, and class labels (vehicles, pedestrians, obstacles).
3. **Sensor Fusion**: Ultrasonic and Radar metrics are combined with visual bounding box size to estimate proximity and collision hazard level.
4. **Alert Triggering**: Proximity below threshold activates IR warning LEDs, active buzzers, and UI red danger flags.
