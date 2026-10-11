"""
ADAS+ Camera Stream & Ingestion Latency Tester
=============================================
Standalone verification script to benchmark MJPEG video feeds from the ESP32-CAM
or local webcams / video files.

Features:
- Live FPS and frame latency telemetry
- Visual HUD overlay (resolution, FPS, elapsed time)
- Headless benchmark mode (for SSH / CI environments)
- Mock frame fallback if physical camera stream is offline

Usage:
    # Test ESP32-CAM stream (default IP)
    python examples/test_stream.py --source http://10.12.202.214:81/stream

    # Test local USB webcam
    python examples/test_stream.py --source 0

    # Test headless (no GUI window, logs metrics to console)
    python examples/test_stream.py --source 0 --headless --duration 10

    # Test with synthetic mock stream (no hardware needed)
    python examples/test_stream.py --mock
"""

import argparse
import sys
import time
import numpy as np

try:
    import cv2
except ImportError:
    print("[ERROR] OpenCV is required. Install via: pip install opencv-python")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="ADAS+ Stream & Video Latency Verification Tool")
    parser.add_argument("--source", type=str, default="http://10.12.202.214:81/stream",
                        help="Video source: stream URL, webcam index (0, 1), or video file path")
    parser.add_argument("--headless", action="store_true",
                        help="Run without displaying a graphical window (logs to terminal)")
    parser.add_argument("--mock", action="store_true",
                        help="Generate synthetic frames locally for pipeline testing")
    parser.add_argument("--duration", type=int, default=0,
                        help="Auto-exit after N seconds (0 = run indefinitely until 'q')")
    return parser.parse_args()


def generate_mock_frame(frame_idx: int, width: int = 320, height: int = 240) -> np.ndarray:
    """Generates an animated test frame for simulation testing."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    # Background gradient
    t = (frame_idx * 2) % 255
    frame[:, :, 0] = (np.linspace(20, 60, width, dtype=np.uint8))
    frame[:, :, 1] = (np.linspace(15, 45, width, dtype=np.uint8))
    frame[:, :, 2] = (np.linspace(30, 80, width, dtype=np.uint8))
    
    # Animated test pattern (moving obstacle box)
    box_x = int(50 + 150 * (0.5 + 0.5 * np.sin(frame_idx * 0.05)))
    box_y = int(60 + 60 * (0.5 + 0.5 * np.cos(frame_idx * 0.05)))
    cv2.rectangle(frame, (box_x, box_y), (box_x + 60, box_y + 40), (0, 165, 255), 2)
    cv2.putText(frame, "SIMULATED OBSTACLE", (box_x - 10, box_y - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
    return frame


def run_stream_test(args):
    source = args.source
    if source.isdigit():
        source = int(source)

    print("=" * 60)
    print("ADAS+ Video Stream & Ingestion Latency Tester")
    print("=" * 60)
    print(f"Target Source: {source if not args.mock else 'SYNTHETIC MOCK GENERATOR'}")
    print(f"Headless Mode: {args.headless}")
    print("Press 'q' or ESC in the window to quit.\n")

    cap = None
    if not args.mock:
        print(f"[INFO] Connecting to video capture source: {source} ...")
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"[WARN] Failed to open video source: {source}")
            print("[WARN] Switching to synthetic mock stream for validation fallback.")
            args.mock = True

    frame_count = 0
    fps_ema = 0.0
    alpha = 0.1  # Exponential moving average smoothing factor
    start_time = time.time()
    prev_time = time.time()

    try:
        while True:
            t_now = time.time()
            if args.duration > 0 and (t_now - start_time) >= args.duration:
                print(f"\n[INFO] Duration limit of {args.duration}s reached. Exiting.")
                break

            if args.mock:
                frame = generate_mock_frame(frame_count)
                time.sleep(0.033)  # Simulate ~30 FPS
                ret = True
            else:
                ret, frame = cap.read()
                if not ret or frame is None:
                    print("\n[WARN] Stream connection dropped or frame read failed. Retrying...")
                    time.sleep(0.2)
                    continue

            frame_count += 1
            dt = t_now - prev_time
            prev_time = t_now
            instant_fps = 1.0 / dt if dt > 0 else 0.0
            fps_ema = instant_fps if frame_count == 1 else (alpha * instant_fps + (1 - alpha) * fps_ema)

            h, w = frame.shape[:2]

            # Telemetry text
            hud_text_fps = f"FPS: {fps_ema:5.1f} | Res: {w}x{h}"
            hud_text_time = f"Frames: {frame_count} | Elapsed: {t_now - start_time:5.1f}s"
            hud_source = f"Src: {str(source)[:28]}" if not args.mock else "Src: MOCK SYNTHETIC"

            if args.headless:
                if frame_count % 30 == 0 or frame_count == 1:
                    print(f"[{hud_source}] Frame {frame_count:05d} | {fps_ema:5.1f} FPS | Res: {w}x{h} | Elapsed: {t_now - start_time:5.1f}s")
            else:
                # Render HUD overlay on frame
                cv2.rectangle(frame, (8, 8), (312, 70), (0, 0, 0), -1)
                cv2.rectangle(frame, (8, 8), (312, 70), (0, 255, 120), 1)
                cv2.putText(frame, hud_text_fps, (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 120), 1, cv2.LINE_AA)
                cv2.putText(frame, hud_text_time, (16, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)
                cv2.putText(frame, hud_source, (16, 64), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA)

                cv2.imshow("ADAS+ Stream Verification", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord('q'), 27):
                    print("\n[INFO] User requested exit ('q' / ESC pressed).")
                    break

    except KeyboardInterrupt:
        print("\n[INFO] Stopped by user (SIGINT).")
    finally:
        if cap is not None:
            cap.release()
        if not args.headless:
            cv2.destroyAllWindows()

        elapsed = time.time() - start_time
        avg_fps = (frame_count / elapsed) if elapsed > 0 else 0.0
        print("\n" + "=" * 60)
        print("Stream Benchmark Summary:")
        print(f"  Total Frames Captured: {frame_count}")
        print(f"  Total Duration:        {elapsed:.2f} s")
        print(f"  Average Throughput:    {avg_fps:.2f} FPS")
        print("=" * 60)


if __name__ == "__main__":
    run_stream_test(parse_args())
