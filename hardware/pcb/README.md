# ADAS+ PCB Layout & Manufacturing Specifications

This directory contains specifications and layout guidelines for transitioning the ADAS+ sensor-fusion prototype from a breadboard/perfboard setup into an automotive-grade Raspberry Pi HAT PCB.

---

## Prototype vs Production Hardware Status

| Stage | Implementation | Status |
|---|---|---|
| **Current Prototype** | Point-to-point wired prototyping board (perfboard) with through-hole resistors, LM358 breakout, and 2N2222 transistors | ✅ Tested & Functional (0.2–6 m range) |
| **Planned Production HAT** | Custom 2-layer FR-4 Printed Circuit Board (Raspberry Pi 40-pin Form Factor) | 🛠️ In Design Specification (Planned) |

---

## Planned PCB Form Factor & Specifications

The planned custom board is designed as a standard **Raspberry Pi HAT (Hardware Attached on Top)** (65 mm × 56 mm) with mounting holes aligning to the Raspberry Pi 4 Model B.

### Layer Stackup & Physical Specs
- **Layers**: 2 Layer FR-4
- **Board Dimensions**: 65.0 mm × 56.5 mm (Standard HAT specification)
- **Board Thickness**: 1.6 mm
- **Copper Weight**: 1 oz (35 µm)
- **Solder Mask**: Matte Black / Industrial Green
- **Silkscreen**: White (pinout labels and polarity markings clearly visible)
- **Surface Finish**: HASL Lead-Free or ENIG (Electroless Nickel Immersion Gold)

---

## On-Board Subsystems & Footprints

1. **40-Pin GPIO Header (J1)**:
   - 2×20 female receptacle header (2.54 mm pitch) mating with the Raspberry Pi.
2. **Radar Conditioning Circuit**:
   - LM358 SOIC-8 operational amplifier with potentiometer header for threshold sensitivity tuning.
   - Decoupling capacitors (100 nF ceramic close to VCC pin).
3. **Ultrasonic Level Shifter**:
   - SMD 0805 1kΩ / 2kΩ precision resistor voltage divider on Echo channel.
4. **Actuator Driver Stage**:
   - Dual SOT-23 / TO-92 2N2222 NPN transistors for buzzer and 850 nm IR LED switching.
   - Dual 1N4148 SMD diodes for inductive kickback suppression.
5. **Screw Terminals & External Connectors**:
   - 4-pin 3.81 mm pluggable screw terminal for HC-SR04 sensor extension wiring.
   - 3-pin 3.81 mm terminal for HB100 microwave radar wiring.
   - 2-pin terminal for external high-power IR LED floodlight.
6. **Automotive Power Conditioning (Planned)**:
   - Footprint for 12V-to-5V step-down buck converter (e.g. TI LM2596 or MP1584EN) to power the Raspberry Pi and ESP32 directly from vehicle 12V cigarette lighter / accessory port.

---

## Routing & PCB Design Rules

- **Signal Traces**: Minimum 0.25 mm (10 mil) width.
- **Power Traces (5V, 3.3V, GND)**: Minimum 0.8 mm – 1.2 mm (30–48 mil) width.
- **Clearance**: Minimum 0.2 mm (8 mil) between all copper features.
- **Ground Planes**: Continuous ground plane pour on bottom layer with thermal reliefs on GND pads.
- **Antenna Keep-Out**: Keep high-speed radar and Wi-Fi signal tracks away from switching power converter inductors to prevent EMI.
