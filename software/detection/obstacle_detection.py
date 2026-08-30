#!/usr/bin/env python3
"""
ADAS+ Obstacle Detection System
Stream: ESP32-CAM (MJPEG via requests)
Sensors: HC-SR04 + HB100 Radar + IR LED + Active Buzzer
"""

import os
import sys
import time
import signal
import threading

import cv2
import numpy as np
import requests

from flask import Flask, Response, jsonify


# --- Optional Hardware GPIO ---
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except Exception:
    GPIO_AVAILABLE = False
    GPIO = None


# --- Configuration & Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
YOLO_DIR = os.path.join(BASE_DIR, "yolov3tiny")


def get_yolo_path(filename):
    """Check yolov3tiny subfolder first, then fall back to script root."""
    subfolder_path = os.path.join(YOLO_DIR, filename)
    if os.path.isfile(subfolder_path):
        return subfolder_path
    return os.path.join(BASE_DIR, filename)


# ESP32-CAM stream configuration
ESP32_IP = "10.12.202.214"
ESP32_STREAM_URL = f"http://{ESP32_IP}:81/stream"

CAMERA_WIDTH = 320
CAMERA_HEIGHT = 240
JPEG_QUALITY = 65

# Model paths
YOLO_CONFIG = get_yolo_path("yolov3-tiny.cfg")
YOLO_WEIGHTS = get_yolo_path("yolov3-tiny.weights")
YOLO_NAMES = get_yolo_path("coco.names")

CUSTOM_YOLO_PT = os.path.join(BASE_DIR, "runs", "ADAS_plus_yolov3_tiny", "weights", "best.pt")
CUSTOM_YOLO_ONNX = os.path.join(BASE_DIR, "runs", "ADAS_plus_yolov3_tiny", "weights", "best.onnx")
PRETRAINED_YOLO_PT = os.path.join(BASE_DIR, "yolov3-tinyu.pt")

YOLO_SIZE = 192
CONFIDENCE_THRESHOLD = 0.28
NMS_THRESHOLD = 0.35
DETECT_INTERVAL = 1.5
DETECTION_GRACE = 2.5

# Target object classes
TARGET_CLASSES = {
    "person", "car", "bicycle", "motorcycle", "bus", "truck",
    "cat", "dog", "cow", "horse", "sheep", "bird", "elephant", "bear"
}

# Ranging distance thresholds (meters)
RED_DISTANCE = 1.5
ORANGE_DISTANCE = 3.0

# Hardware GPIO pin assignments (BCM)
TRIG_PIN = 23
ECHO_PIN = 24
BUZZER_PIN = 18
RADAR_PIN = 25
IR_LED_PIN = 12

IR_BRIGHTNESS_LIMIT = 55
IR_CHECK_INTERVAL = 2.0


# --- Global System State & Thread Locks ---
running = True

latest_jpeg = None
latest_jpeg_time = 0.0
jpeg_lock = threading.Lock()

latest_frame = None
latest_frame_time = 0.0
frame_lock = threading.Lock()

detected_objects = []
target_detected = False
last_detection_time = 0.0
detection_lock = threading.Lock()

distance_m = -1.0
radar_motion = False
ir_status = False
sensor_lock = threading.Lock()

camera_fps = 0.0
yolo_time = 0.0
last_yolo_run = 0.0


# --- GPIO Setup ---
if GPIO_AVAILABLE:
    try:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(TRIG_PIN, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(ECHO_PIN, GPIO.IN)
        GPIO.setup(BUZZER_PIN, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(RADAR_PIN, GPIO.IN)
        GPIO.setup(IR_LED_PIN, GPIO.OUT, initial=GPIO.LOW)
        print("[GPIO] Hardware initialized.")
    except Exception as e:
        print(f"[GPIO] Setup error: {e}")
        GPIO_AVAILABLE = False
else:
    print("[GPIO] GPIO unavailable. Running in simulation mode.")


try:
    cv2.setNumThreads(1)
except Exception:
    pass


# --- Model Loading & Inference Setup ---
model_backend = None
ultralytics_model = None
net = None
output_layers = []
classes = []


def init_yolo_detector():
    global model_backend, ultralytics_model, net, output_layers, classes

    # 1. Try PyTorch model via Ultralytics (custom best.pt or yolov3-tinyu.pt)
    candidate_pt = None
    if os.path.isfile(CUSTOM_YOLO_PT):
        candidate_pt = CUSTOM_YOLO_PT
        print(f"[YOLO] Custom trained model found: '{CUSTOM_YOLO_PT}'")
    elif os.path.isfile(PRETRAINED_YOLO_PT):
        candidate_pt = PRETRAINED_YOLO_PT
        print(f"[YOLO] Pretrained PyTorch model found: '{PRETRAINED_YOLO_PT}'")

    if candidate_pt:
        try:
            from ultralytics import YOLO
            ultralytics_model = YOLO(candidate_pt)
            classes = list(ultralytics_model.names.values())
            model_backend = "ultralytics"
            print(f"[YOLO] Loaded Ultralytics model ({len(classes)} classes).")
            return
        except Exception as e:
            print(f"[YOLO] Ultralytics load error: {e}. Falling back to Darknet...")

    # 2. Try ONNX model via OpenCV DNN
    if os.path.isfile(CUSTOM_YOLO_ONNX):
        try:
            net = cv2.dnn.readNetFromONNX(CUSTOM_YOLO_ONNX)
            net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            classes = ["cat", "dog"]
            model_backend = "onnx"
            print(f"[YOLO] Loaded OpenCV DNN ONNX model.")
            return
        except Exception as e:
            print(f"[YOLO] ONNX load error: {e}. Falling back to Darknet...")

    # 3. Fallback to Darknet YOLOv3-Tiny
    print(f"[YOLO] Loading Darknet model from '{YOLO_DIR}'...")
    if not os.path.isfile(YOLO_CONFIG) or not os.path.isfile(YOLO_WEIGHTS) or not os.path.isfile(YOLO_NAMES):
        print("[YOLO] ERROR: Missing Darknet model files.")
        net = None
        return

    try:
        with open(YOLO_NAMES, "r") as f:
            classes = [line.strip() for line in f if line.strip()]

        net = cv2.dnn.readNetFromDarknet(YOLO_CONFIG, YOLO_WEIGHTS)
        net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

        layer_names = net.getLayerNames()
        output_layers = [layer_names[i - 1] for i in net.getUnconnectedOutLayers().flatten()]
        model_backend = "darknet"
        print(f"[YOLO] Loaded Darknet model ({len(classes)} COCO classes).")
    except Exception as e:
        print(f"[YOLO] ERROR loading Darknet model: {e}")
        net = None


init_yolo_detector()

# Warmup pass
try:
    dummy = np.zeros((YOLO_SIZE, YOLO_SIZE, 3), dtype=np.uint8)
    if model_backend == "ultralytics" and ultralytics_model is not None:
        ultralytics_model.predict(source=dummy, conf=CONFIDENCE_THRESHOLD, verbose=False)
    elif net is not None:
        blob = cv2.dnn.blobFromImage(dummy, 1 / 255.0, (YOLO_SIZE, YOLO_SIZE), swapRB=True, crop=False)
        net.setInput(blob)
        if output_layers:
            net.forward(output_layers)
        else:
            net.forward()
    print("[YOLO] Warm-up complete.")
except Exception as e:
    print(f"[YOLO] Warmup warning: {e}")


# --- Distance Measurement Functions ---
def get_distance():
    if not GPIO_AVAILABLE:
        return -1.0

    try:
        GPIO.output(TRIG_PIN, GPIO.LOW)
        time.sleep(0.000002)
        GPIO.output(TRIG_PIN, GPIO.HIGH)
        time.sleep(0.000010)
        GPIO.output(TRIG_PIN, GPIO.LOW)

        timeout = time.monotonic() + 0.025
        while GPIO.input(ECHO_PIN) == 0:
            if time.monotonic() > timeout:
                return -1.0
            time.sleep(0)

        pulse_start = time.monotonic()

        timeout = time.monotonic() + 0.025
        while GPIO.input(ECHO_PIN) == 1:
            if time.monotonic() > timeout:
                return -1.0
            time.sleep(0)

        pulse_end = time.monotonic()

        distance_cm = ((pulse_end - pulse_start) * 34300.0) / 2.0

        if distance_cm < 2 or distance_cm > 400:
            return -1.0

        return distance_cm / 100.0
    except Exception:
        return -1.0


distance_history = []


def stable_distance():
    global distance_history
    d = get_distance()
    if d <= 0:
        return -1.0

    distance_history.append(d)
    if len(distance_history) > 5:
        distance_history.pop(0)

    return float(np.median(distance_history))


# --- Camera MJPEG Thread ---
def camera_thread():
    global latest_jpeg, latest_jpeg_time, latest_frame, latest_frame_time, camera_fps

    print(f"[CAMERA] Connecting to stream at {ESP32_STREAM_URL} ...")

    while running:
        response = None
        try:
            response = requests.get(ESP32_STREAM_URL, stream=True, timeout=(3, 10))
            print("[CAMERA] Stream connected.")

            buffer = b""
            frame_counter = 0
            fps_start = time.monotonic()

            for chunk in response.iter_content(chunk_size=4096):
                if not running:
                    break
                if not chunk:
                    continue

                buffer += chunk

                start = buffer.find(b"\xff\xd8")
                if start < 0:
                    if len(buffer) > 200000:
                        buffer = buffer[-10000:]
                    continue

                end = buffer.find(b"\xff\xd9", start + 2)
                if end < 0:
                    continue

                end += 2
                jpeg = buffer[start:end]
                buffer = buffer[end:]

                if len(jpeg) < 100:
                    continue

                with jpeg_lock:
                    latest_jpeg = jpeg
                    latest_jpeg_time = time.time()

                frame_counter += 1
                now = time.monotonic()
                if now - fps_start >= 1.0:
                    camera_fps = frame_counter / (now - fps_start)
                    frame_counter = 0
                    fps_start = now

                with frame_lock:
                    latest_frame_time = time.time()

        except requests.exceptions.Timeout:
            print("[CAMERA] Timeout - reconnecting...")
        except requests.exceptions.ConnectionError:
            print("[CAMERA] Connection lost - reconnecting...")
        except Exception as e:
            print(f"[CAMERA] Error: {e}")
        finally:
            try:
                if response is not None:
                    response.close()
            except Exception:
                pass

        if running:
            time.sleep(0.5)

    print("[CAMERA] Stopped.")


def get_latest_decoded_frame():
    with jpeg_lock:
        if latest_jpeg is None:
            return None
        jpeg = latest_jpeg

    try:
        array = np.frombuffer(jpeg, dtype=np.uint8)
        frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if frame is None:
            return None

        if frame.shape[1] != CAMERA_WIDTH or frame.shape[0] != CAMERA_HEIGHT:
            frame = cv2.resize(frame, (CAMERA_WIDTH, CAMERA_HEIGHT), interpolation=cv2.INTER_LINEAR)

        return frame
    except Exception:
        return None


# --- Detection Engine ---
def detect_objects(frame):
    height, width = frame.shape[:2]

    # --- Ultralytics PyTorch Backend ---
    if model_backend == "ultralytics" and ultralytics_model is not None:
        try:
            results_list = ultralytics_model.predict(source=frame, conf=CONFIDENCE_THRESHOLD, iou=NMS_THRESHOLD, verbose=False)
            if not results_list:
                return []

            boxes_obj = results_list[0].boxes
            if boxes_obj is None or len(boxes_obj) == 0:
                return []

            results = []
            for box in boxes_obj:
                cls_id = int(box.cls[0])
                confidence = float(box.conf[0])
                name = ultralytics_model.names.get(cls_id, str(cls_id)).lower()

                if len(classes) > 15 and name not in TARGET_CLASSES:
                    continue

                xyxy = box.xyxy[0].cpu().numpy() if hasattr(box.xyxy[0], 'cpu') else box.xyxy[0]
                x1, y1, x2, y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])
                w = x2 - x1
                h = y2 - y1

                if w < 10 or h < 10:
                    continue

                results.append({
                    "name": name,
                    "confidence": round(confidence * 100, 1),
                    "x": int(max(0, x1)),
                    "y": int(max(0, y1)),
                    "w": int(w),
                    "h": int(h)
                })

            results.sort(key=lambda x: x["confidence"], reverse=True)
            return results
        except Exception as e:
            print(f"[YOLO] Ultralytics detection error: {e}")
            return []

    # --- OpenCV DNN Backend ---
    if net is None:
        return []

    blob = cv2.dnn.blobFromImage(frame, 1 / 255.0, (YOLO_SIZE, YOLO_SIZE), swapRB=True, crop=False)
    net.setInput(blob)

    try:
        if output_layers:
            outputs = net.forward(output_layers)
        else:
            outputs = [net.forward()]
    except Exception as e:
        print(f"[YOLO] DNN inference error: {e}")
        return []

    boxes = []
    confidences = []
    class_ids = []

    for output in outputs:
        for detection in output:
            scores = detection[5:] if len(detection) > 5 else detection[4:]
            if len(scores) == 0:
                continue

            class_id = int(np.argmax(scores))
            confidence = float(scores[class_id])

            if confidence < CONFIDENCE_THRESHOLD or class_id >= len(classes):
                continue

            name = str(classes[class_id]).lower()
            if len(classes) > 15 and name not in TARGET_CLASSES:
                continue

            center_x = int(detection[0] * width)
            center_y = int(detection[1] * height)
            w = int(detection[2] * width)
            h = int(detection[3] * height)

            if w < 10 or h < 10:
                continue

            x = max(0, int(center_x - w / 2))
            y = max(0, int(center_y - h / 2))
            w = min(w, width - x)
            h = min(h, height - y)

            boxes.append([x, y, w, h])
            confidences.append(confidence)
            class_ids.append(class_id)

    if not boxes:
        return []

    indexes = cv2.dnn.NMSBoxes(boxes, confidences, CONFIDENCE_THRESHOLD, NMS_THRESHOLD)
    if len(indexes) == 0:
        return []

    results = []
    for i in np.array(indexes).flatten():
        x, y, w, h = boxes[i]
        name = str(classes[class_ids[i]]).lower()
        results.append({
            "name": name,
            "confidence": round(confidences[i] * 100, 1),
            "x": int(x),
            "y": int(y),
            "w": int(w),
            "h": int(h)
        })

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results


def detection_thread():
    global detected_objects, target_detected, last_detection_time, yolo_time, last_yolo_run, latest_frame

    print("[DETECTION] Started.")

    while running:
        cycle_start = time.time()

        if last_yolo_run > 0:
            wait = DETECT_INTERVAL - (time.time() - last_yolo_run)
            if wait > 0:
                time.sleep(min(wait, 0.2))
                continue

        frame = get_latest_decoded_frame()
        if frame is None:
            time.sleep(0.1)
            continue

        latest_frame = frame

        t0 = time.time()
        try:
            objects = detect_objects(frame)
        except Exception as e:
            print(f"[YOLO] Error: {e}")
            objects = []

        yolo_time = time.time() - t0
        last_yolo_run = time.time()

        if objects:
            with detection_lock:
                detected_objects = objects
                target_detected = True
                last_detection_time = time.time()

            names_str = ", ".join(f"{o['name']} {o['confidence']:.0f}%" for o in objects)
            print(f"[YOLO] Target: {names_str}")
        else:
            with detection_lock:
                age = time.time() - last_detection_time
                if not (target_detected and age < DETECTION_GRACE):
                    detected_objects = []
                    target_detected = False

            print("[YOLO] No target.")

        elapsed = time.time() - cycle_start
        if elapsed < 0.05:
            time.sleep(0.05 - elapsed)

    print("[DETECTION] Stopped.")


def sensor_thread():
    global distance_m, radar_motion

    print("[SENSOR] Started.")

    while running:
        with detection_lock:
            active = target_detected

        if active:
            d = stable_distance()
            with sensor_lock:
                distance_m = d
        else:
            with sensor_lock:
                distance_m = -1.0
            distance_history.clear()

        if GPIO_AVAILABLE:
            try:
                radar_motion = bool(GPIO.input(RADAR_PIN))
            except Exception:
                radar_motion = False
        else:
            radar_motion = False

        time.sleep(0.10)

    print("[SENSOR] Stopped.")


def buzzer_thread():
    print("[BUZZER] Started.")

    while running:
        with detection_lock:
            active = target_detected

        with sensor_lock:
            d = distance_m

        if not active or d <= 0:
            if GPIO_AVAILABLE:
                GPIO.output(BUZZER_PIN, GPIO.LOW)
            time.sleep(0.08)
            continue

        if d < RED_DISTANCE:
            if GPIO_AVAILABLE:
                GPIO.output(BUZZER_PIN, GPIO.HIGH)
            time.sleep(0.08)
        elif d < ORANGE_DISTANCE:
            if GPIO_AVAILABLE:
                GPIO.output(BUZZER_PIN, GPIO.HIGH)
            time.sleep(0.18)
            if GPIO_AVAILABLE:
                GPIO.output(BUZZER_PIN, GPIO.LOW)
            time.sleep(0.38)
        else:
            if GPIO_AVAILABLE:
                GPIO.output(BUZZER_PIN, GPIO.LOW)
            time.sleep(0.15)

    print("[BUZZER] Stopped.")


def ir_thread():
    global ir_status

    print("[IR] Started.")

    while running:
        try:
            with jpeg_lock:
                jpeg = latest_jpeg

            if jpeg is None:
                time.sleep(IR_CHECK_INTERVAL)
                continue

            array = np.frombuffer(jpeg, dtype=np.uint8)
            frame = cv2.imdecode(array, cv2.IMREAD_GRAYSCALE)
            if frame is None:
                time.sleep(IR_CHECK_INTERVAL)
                continue

            small = cv2.resize(frame, (80, 60))
            brightness = float(np.mean(small))

            if GPIO_AVAILABLE:
                if brightness < IR_BRIGHTNESS_LIMIT:
                    GPIO.output(IR_LED_PIN, GPIO.HIGH)
                    ir_status = True
                else:
                    GPIO.output(IR_LED_PIN, GPIO.LOW)
                    ir_status = False
            else:
                ir_status = False
        except Exception:
            pass

        time.sleep(IR_CHECK_INTERVAL)

    print("[IR] Stopped.")


# --- Web Application & Telemetry Endpoints ---
app = Flask(__name__)


def generate_stream():
    last_sent_time = 0

    while running:
        with jpeg_lock:
            jpeg = latest_jpeg
            jpeg_time = latest_jpeg_time

        if jpeg is None:
            time.sleep(0.05)
            continue

        if jpeg_time == last_sent_time:
            time.sleep(0.01)
            continue

        last_sent_time = jpeg_time

        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n")


@app.route("/status")
def status():
    with detection_lock:
        objects = list(detected_objects)
        active = target_detected

    with sensor_lock:
        d = distance_m

    if not active:
        zone = "CLEAR"
    elif d > 0 and d < RED_DISTANCE:
        zone = "DANGER"
    elif d > 0 and d < ORANGE_DISTANCE:
        zone = "CAUTION"
    elif d >= ORANGE_DISTANCE:
        zone = "SAFE"
    else:
        zone = "WAITING"

    if objects:
        main_object = objects[0]["name"]
        main_confidence = objects[0]["confidence"]
    else:
        main_object = "None"
        main_confidence = 0

    return jsonify({
        "target_detected": active,
        "objects": objects,
        "object": main_object,
        "confidence": main_confidence,
        "distance_m": round(d, 2) if d > 0 else -1,
        "zone": zone,
        "radar": bool(radar_motion),
        "ir": bool(ir_status),
        "camera_fps": round(camera_fps, 1),
        "yolo_time": round(yolo_time, 2)
    })


@app.route("/")
def home():
    return """<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ADAS+</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #0d0d0d; color: white; font-family: Arial, sans-serif; text-align: center; }
h1 { margin: 16px 8px 4px; font-size: 30px; }
.subtitle { color: #999; font-size: 15px; margin-bottom: 14px; }
.camera { width: 96%; max-width: 900px; border-radius: 12px; border: 3px solid #333; background: #111; }
.card { width: 94%; max-width: 700px; margin: 12px auto; padding: 18px; background: #222; border-radius: 14px; }
.value { font-size: 25px; font-weight: bold; margin: 10px; }
.small { font-size: 15px; color: #aaa; margin-top: 8px; }
.status { font-size: 20px; font-weight: bold; margin: 8px; }
.safe { color: #00e676; }
.caution { color: #ffb300; }
.danger { color: #ff5252; }
.wait { color: #aaaaaa; }
</style>
</head>
<body>
<h1>ADAS+ OBSTACLE DETECTION</h1>
<div class="subtitle">Camera &rarr; AI &rarr; Sensor &rarr; Alert</div>
<img class="camera" src="/video_feed" alt="Live Camera Stream">
<div class="card">
<div class="value" id="object">Target: None</div>
<div class="value" id="distance">Distance: --</div>
<div class="status wait" id="zone">CLEAR</div>
<div class="status" id="confidence">Confidence: --</div>
<div class="small" id="radar">Radar: --</div>
<div class="small" id="ir">IR: --</div>
<div class="small" id="performance">Camera: -- FPS | AI: --</div>
</div>
<script>
async function updateStatus() {
    try {
        const response = await fetch("/status", { cache: "no-store" });
        const data = await response.json();
        let objectText = "Target: None";
        if (data.target_detected && data.object !== "None") {
            objectText = "Target: " + data.object;
        }
        document.getElementById("object").innerText = objectText;
        if (data.distance_m > 0) {
            document.getElementById("distance").innerText = "Distance: " + data.distance_m.toFixed(2) + " m";
        } else {
            document.getElementById("distance").innerText = "Distance: --";
        }
        const zone = document.getElementById("zone");
        zone.innerText = data.zone;
        zone.className = "status ";
        if (data.zone === "DANGER") zone.className += "danger";
        else if (data.zone === "CAUTION") zone.className += "caution";
        else if (data.zone === "SAFE") zone.className += "safe";
        else zone.className += "wait";

        if (data.confidence > 0) {
            document.getElementById("confidence").innerText = "Confidence: " + data.confidence + "%";
        } else {
            document.getElementById("confidence").innerText = "Confidence: --";
        }
        document.getElementById("radar").innerText = "Radar: " + (data.radar ? "MOVEMENT" : "NO MOVEMENT");
        document.getElementById("ir").innerText = "IR: " + (data.ir ? "ON" : "OFF");
        document.getElementById("performance").innerText = "Camera: " + data.camera_fps + " FPS | AI: " + data.yolo_time + "s";
    } catch(error) {
        console.log(error);
    }
}
setInterval(updateStatus, 500);
updateStatus();
</script>
</body>
</html>
"""


@app.route("/video_feed")
def video_feed():
    return Response(generate_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


def shutdown(signum=None, frame=None):
    global running
    if not running:
        return
    print("\n[SYSTEM] Shutting down...")
    running = False
    try:
        if GPIO_AVAILABLE:
            GPIO.output(BUZZER_PIN, GPIO.LOW)
            GPIO.output(IR_LED_PIN, GPIO.LOW)
            GPIO.cleanup()
    except Exception:
        pass
    print("[SYSTEM] Shutdown complete.")
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)


def main():
    print("\n--- ADAS+ OBSTACLE SYSTEM ---\n")

    camera = threading.Thread(target=camera_thread, daemon=True)
    detection = threading.Thread(target=detection_thread, daemon=True)
    sensors = threading.Thread(target=sensor_thread, daemon=True)
    buzzer = threading.Thread(target=buzzer_thread, daemon=True)
    ir = threading.Thread(target=ir_thread, daemon=True)

    print("[SYSTEM] Starting threads...")
    camera.start()
    detection.start()
    sensors.start()
    buzzer.start()
    ir.start()

    print("\n[WEB] Web server listening on http://0.0.0.0:5000\n")

    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
