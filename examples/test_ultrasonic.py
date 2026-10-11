#!/usr/bin/env python3
"""
ADAS-Plus Example: HC-SR04 Ultrasonic Sensor Verification
Tests trigger/echo distance ranging with a 5-sample median filter.
Runs on Raspberry Pi GPIO or provides simulated readings on PC.

Usage:
    python examples/test_ultrasonic.py --samples 20
    python examples/test_ultrasonic.py --continuous
    python examples/test_ultrasonic.py --simulate
"""

import argparse
import sys
import time
import numpy as np

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception:
    GPIO_AVAILABLE = False

TRIG_PIN = 23
ECHO_PIN = 24


def parse_args():
    parser = argparse.ArgumentParser(description="ADAS+ HC-SR04 Ultrasonic Verification Tool")
    parser.add_argument("--samples", type=int, default=0,
                        help="Number of samples to collect (0 = continuous until Ctrl+C)")
    parser.add_argument("--continuous", action="store_true",
                        help="Run continuously until Ctrl+C")
    parser.add_argument("--simulate", action="store_true",
                        help="Force software simulation mode")
    return parser.parse_args()


def setup_gpio(force_sim: bool = False):
    if not GPIO_AVAILABLE or force_sim:
        print("[WARN] Running in simulated bench mode.")
        return
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(TRIG_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(ECHO_PIN, GPIO.IN)
    time.sleep(0.1)


def measure_distance(force_sim: bool = False):
    if not GPIO_AVAILABLE or force_sim:
        # Simulate realistic 0.5m to 4.0m distance readings with slight jitter
        base_dist = 2.45
        noise = float(np.random.normal(0, 0.03))
        return round(max(0.2, base_dist + noise), 3)

    GPIO.output(TRIG_PIN, GPIO.LOW)
    time.sleep(0.000002)
    GPIO.output(TRIG_PIN, GPIO.HIGH)
    time.sleep(0.000010)
    GPIO.output(TRIG_PIN, GPIO.LOW)

    timeout = time.monotonic() + 0.03
    while GPIO.input(ECHO_PIN) == 0:
        if time.monotonic() > timeout:
            return -1.0

    pulse_start = time.monotonic()
    timeout = time.monotonic() + 0.03
    while GPIO.input(ECHO_PIN) == 1:
        if time.monotonic() > timeout:
            return -1.0

    pulse_end = time.monotonic()
    distance_cm = ((pulse_end - pulse_start) * 34300.0) / 2.0

    if distance_cm < 2.0 or distance_cm > 400.0:
        return -1.0

    return round(distance_cm / 100.0, 3)


def main():
    args = parse_args()
    print("==================================================")
    print(" ADAS+ HC-SR04 ULTRASONIC SENSOR TEST")
    print(f" TRIG: GPIO {TRIG_PIN} | ECHO: GPIO {ECHO_PIN}")
    print(f" Target Samples: {'Continuous' if args.samples == 0 else args.samples}")
    print(" Press Ctrl+C to terminate test.")
    print("==================================================")

    setup_gpio(args.simulate)
    samples = []
    count = 0

    try:
        while True:
            if args.samples > 0 and count >= args.samples:
                print(f"\n[INFO] Completed {args.samples} requested samples.")
                break

            count += 1
            dist = measure_distance(args.simulate)
            if dist > 0:
                samples.append(dist)
                if len(samples) > 5:
                    samples.pop(0)
                filtered_dist = float(np.median(samples))
                status = "DANGER (<1.5m)" if filtered_dist < 1.5 else \
                         "CAUTION (<3.0m)" if filtered_dist < 3.0 else "CLEAR"
                print(f"[{count:03d}] Raw: {dist:.3f} m | Filtered (5-Median): {filtered_dist:.3f} m | Zone: {status}")
            else:
                print(f"[{count:03d}] Out of range or echo timeout (> 4.0 m)")

            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n[INFO] Test stopped by user.")
    finally:
        if GPIO_AVAILABLE and not args.simulate:
            GPIO.cleanup()
        print("[INFO] GPIO cleaned up successfully.")


if __name__ == "__main__":
    main()
