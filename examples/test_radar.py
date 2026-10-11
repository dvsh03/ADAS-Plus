#!/usr/bin/env python3
"""
ADAS-Plus Example: HB100 Microwave Doppler Radar Verification
Monitors binary motion triggers and demonstrates Doppler pulse frequency detection.
Runs on Raspberry Pi GPIO or provides simulated motion triggers on PC.

Usage:
    python examples/test_radar.py --duration 10
    python examples/test_radar.py --duration 30 --poll-rate 20
"""

import argparse
import random
import sys
import time

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception:
    GPIO_AVAILABLE = False

RADAR_PIN = 25


def parse_args():
    parser = argparse.ArgumentParser(description="ADAS+ HB100 Doppler Microwave Radar Verification Tool")
    parser.add_argument("--duration", type=int, default=0,
                        help="Test duration in seconds (0 = run indefinitely until Ctrl+C)")
    parser.add_argument("--poll-rate", type=float, default=5.0,
                        help="Sampling polling frequency in Hz (default: 5 Hz = 0.2s interval)")
    parser.add_argument("--simulate", action="store_true",
                        help="Force software simulation mode")
    return parser.parse_args()


def setup_gpio(force_sim: bool = False):
    if not GPIO_AVAILABLE or force_sim:
        print("[WARN] Running in simulated bench mode.")
        return
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(RADAR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)


def read_radar_motion(force_sim: bool = False):
    if not GPIO_AVAILABLE or force_sim:
        # Simulate intermittent obstacle motion triggers
        return random.random() < 0.25

    return bool(GPIO.input(RADAR_PIN))


def main():
    args = parse_args()
    print("==================================================")
    print(" ADAS+ HB100 24 GHz MICROWAVE RADAR TEST")
    print(f" Input Pin: GPIO {RADAR_PIN} (Physical Pin 22)")
    print(f" Polling Rate: {args.poll_rate} Hz | Duration: {'Continuous' if args.duration == 0 else f'{args.duration}s'}")
    print(" Press Ctrl+C to terminate test.")
    print("==================================================")

    setup_gpio(args.simulate)
    last_trigger_time = 0
    trigger_count = 0
    start_time = time.time()
    interval = 1.0 / max(0.1, args.poll_rate)

    try:
        while True:
            now = time.time()
            if args.duration > 0 and (now - start_time) >= args.duration:
                print(f"\n[INFO] Duration of {args.duration}s elapsed. Exiting test.")
                break

            motion_detected = read_radar_motion(args.simulate)

            if motion_detected:
                trigger_count += 1
                dt_since_last = now - last_trigger_time if last_trigger_time > 0 else 0
                last_trigger_time = now
                print(f"[RADAR] [ALERT] MOTION DETECTED! Pulse #{trigger_count} | Delta: {dt_since_last:.2f} s")
            else:
                print("[RADAR] -- No Doppler motion -- (Quiescent)")

            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[INFO] Radar test terminated by user.")
    finally:
        if GPIO_AVAILABLE and not args.simulate:
            GPIO.cleanup()
        print("[INFO] GPIO cleaned up successfully.")


if __name__ == "__main__":
    main()
