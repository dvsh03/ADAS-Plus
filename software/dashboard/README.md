# Web Dashboard & Monitoring Interface

The ADAS-Plus dashboard provides a real-time web monitoring interface for vehicle operators and safety monitoring.

## 🌟 Key Features

- **Live MJPEG Video Feed**: Real-time annotated video stream with bounding boxes, distance overlays, and danger warnings.
- **Telemetry API**: RESTful JSON endpoints exposing real-time sensor metrics (Ultrasonic distance, Doppler velocity, system CPU/RAM load).
- **Audio-Visual Alerts**: Browser-based audio chimes and visual warnings on critical obstacle proximity.

## 🌐 Endpoints

- `http://<HOST_IP>:5000/` : Live Video Stream & Dashboard UI
- `http://<HOST_IP>:5000/telemetry` : JSON Telemetry Data
