#!/usr/bin/env python3
"""
ADAS-Plus Example: Active Buzzer & IR LED Warning Actuator Verification
Demonstrates Caution pulsed warning tone, Danger continuous tone, and IR LED toggle.
Runs on Raspberry Pi GPIO or provides simulated actuator logging on PC.

Usage:
    python examples/test_buzzer_ir.py --test buzzer
    python examples/test_buzzer_ir.py --test ir
    python examples/test_buzzer_ir.py --test all
"""

import argparse
import sys
import time

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception:
    GPIO_AVAILABLE = False

BUZZER_PIN = 18
IR_LED_PIN = 12


def parse_args():
    parser = argparse.ArgumentParser(description="ADAS+ Buzzer & IR LED Actuator Verification Tool")
    parser.add_argument("--test", choices=["buzzer", "ir", "all"], default="all",
                        help="Subsystem to test (buzzer, ir, or all)")
    parser.add_argument("--simulate", action="store_true",
                        help="Force software simulation mode")
    return parser.parse_args()


def setup_gpio(force_sim: bool = False):
    if not GPIO_AVAILABLE or force_sim:
        print("[WARN] Running in simulated bench mode.")
        return
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BUZZER_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(IR_LED_PIN, GPIO.OUT, initial=GPIO.LOW)


def set_buzzer(state: bool, force_sim: bool = False):
    if GPIO_AVAILABLE and not force_sim:
        GPIO.output(BUZZER_PIN, GPIO.HIGH if state else GPIO.LOW)
    print(f"  [BUZZER] {'[BEEP ON]' if state else '[SILENT]'}")


def set_ir_led(state: bool, force_sim: bool = False):
    if GPIO_AVAILABLE and not force_sim:
        GPIO.output(IR_LED_PIN, GPIO.HIGH if state else GPIO.LOW)
    print(f"  [IR LED] {'[ILLUMINATOR ACTIVE]' if state else '[OFF]'}")


def main():
    args = parse_args()
    print("==================================================")
    print(" ADAS+ WARNING ACTUATOR VERIFICATION TEST")
    print(f" Buzzer Pin: GPIO {BUZZER_PIN} | IR LED Pin: GPIO {IR_LED_PIN}")
    print(f" Test Suite: {args.test.upper()}")
    print("==================================================")

    setup_gpio(args.simulate)

    try:
        if args.test in ("ir", "all"):
            print("\n--- Phase 1: Testing 850 nm IR LED Array ---")
            set_ir_led(True, args.simulate)
            time.sleep(0.5)
            set_ir_led(False, args.simulate)
            time.sleep(0.2)

        if args.test in ("buzzer", "all"):
            print("\n--- Phase 2: Testing CAUTION Zone Pulsed Chimes ---")
            for i in range(3):
                print(f"Chime {i+1}/3:")
                set_buzzer(True, args.simulate)
                time.sleep(0.12)
                set_buzzer(False, args.simulate)
                time.sleep(0.15)

            time.sleep(0.3)

            print("\n--- Phase 3: Testing DANGER Zone Continuous Tone ---")
            set_buzzer(True, args.simulate)
            if args.test == "all":
                set_ir_led(True, args.simulate)
            time.sleep(0.8)
            set_buzzer(False, args.simulate)
            if args.test == "all":
                set_ir_led(False, args.simulate)

        print("\n==================================================")
        print(" [SUCCESS] Requested actuator tests verified.")
        print("==================================================")

    except KeyboardInterrupt:
        print("\n[INFO] Actuator test stopped by user.")
    finally:
        if GPIO_AVAILABLE and not args.simulate:
            GPIO.output(BUZZER_PIN, GPIO.LOW)
            GPIO.output(IR_LED_PIN, GPIO.LOW)
            GPIO.cleanup()
        print("[INFO] GPIO cleanup complete.")


if __name__ == "__main__":
    main()
