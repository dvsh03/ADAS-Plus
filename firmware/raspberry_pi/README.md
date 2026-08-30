# Raspberry Pi Hardware Integration

This module manages the edge processing unit on the **Raspberry Pi** (3B+/4/5).

## 🔌 Hardware GPIO Configuration

- **HC-SR04 Ultrasonic Distance Sensor**: TRIG pin & ECHO pin with voltage divider resistor setup.
- **HB100 Radar Module**: Doppler frequency signal input.
- **IR LED Warning Module**: Visual hazard warning output.
- **Active Buzzer**: Audible alert sounder activated during high-risk proximity alerts.

## 🛠️ Requirements

Ensure `RPi.GPIO` is installed:

```bash
pip install RPi.GPIO
```
