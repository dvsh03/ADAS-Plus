# ESP32-CAM Firmware

This module handles the wireless camera node firmware for the **ESP32-CAM** board.

## 📷 Features

- Captures video frames from the OV2640 camera module.
- Serves an MJPEG video stream over Wi-Fi (`http://<ESP32_IP>:81/stream`).
- Optimized camera settings (QVGA / VGA resolution, JPEG quality 65-80 for low latency).

## 🚀 Flashing Instructions

1. Open Arduino IDE or PlatformIO.
2. Select **AI Thinker ESP32-CAM** as the target board.
3. Configure Wi-Fi SSID & Password in the firmware code.
4. Flash using an FTDI Programmer (GPIO0 connected to GND during flash).
