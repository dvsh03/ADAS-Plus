# ESP32-CAM Firmware

This directory contains the wireless optical node firmware for the **AI-Thinker ESP32-CAM** (OV2640 sensor).

---

## 📷 Features

- **High-Throughput MJPEG Stream**: Serves video frames over HTTP on port 81 (`http://<ESP32_IP>:81/stream`).
- **Low Latency**: Tuned for QVGA (320×240) at 25–30 FPS with dual frame buffers (PSRAM).
- **Brownout Protection**: Disables hardware brownout detector to prevent restart loops during Wi-Fi transmission bursts.

---

## 📁 Source Code

- [`esp32_cam_stream.ino`](esp32_cam_stream.ino) — Main Arduino / PlatformIO firmware sketch.

---

## 🚀 Flashing Instructions

1. **Hardware Preparation**:
   - Connect an FTDI USB-to-TTL programmer to the ESP32-CAM:
     - `FTDI 5V` ➔ `ESP32 5V`
     - `FTDI GND` ➔ `ESP32 GND`
     - `FTDI RX` ➔ `ESP32 U0TXD`
     - `FTDI TX` ➔ `ESP32 U0RXD`
   - **Crucial**: Connect `GPIO 0` to `GND` before powering on (enables flash mode).
2. **Arduino IDE Settings**:
   - Board: **AI Thinker ESP32-CAM**
   - CPU Frequency: **240 MHz (WiFi/BT)**
   - Flash Frequency: **80 MHz**
   - Flash Mode: **QIO**
   - Partition Scheme: **Huge APP (3MB No OTA/1MB SPIFFS)**
3. **Configuration**:
   - In `esp32_cam_stream.ino`, set `ssid` and `password` to your Wi-Fi credentials.
4. **Upload & Run**:
   - Press the Reset button on the ESP32-CAM, click **Upload**.
   - Once upload completes, **disconnect GPIO 0 from GND** and press Reset.
   - Open Serial Monitor at **115200 baud** to see the assigned IP address (e.g., `10.12.202.214`).
