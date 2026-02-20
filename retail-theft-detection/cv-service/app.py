"""
Retail Theft Detection — Flask CV Service
MJPEG streaming, event detection, and alert forwarding to backend.
"""
import cv2
import numpy as np
import time
import json
import threading
import requests
import os
from flask import Flask, Response, jsonify, request
from detector import TheftDetector

app = Flask(__name__)

# ─── CORS ────────────────────────────────────────────────
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

# ─── Configuration ─────────────────────────────────────
BACKEND_URL = 'http://localhost:5000'
CAMERA_INDEX = 0  # 0 = default webcam

# ─── Global State ──────────────────────────────────────
detector = TheftDetector()
camera = None
is_running = False
latest_frame = None
detected_events = []
events_lock = threading.Lock()
use_simulator = False


def send_event_to_backend(event):
    """Forward detected event to Node.js backend."""
    try:
        requests.post(f'{BACKEND_URL}/api/camera/events', json=event, timeout=2)
    except Exception as e:
        print(f'⚠️  Could not send event to backend: {e}')


def camera_loop():
    """Main camera capture and processing loop."""
    global camera, is_running, latest_frame, detected_events, use_simulator

    if use_simulator:
        print('📹 Running in SIMULATION mode (no physical camera)')
        sim_frame_count = 0
        while is_running:
            # Generate simulated frames
            frame = generate_sim_frame(sim_frame_count)
            sim_frame_count += 1
            annotated, events = detector.process_frame(frame)
            latest_frame = annotated

            if events:
                with events_lock:
                    for event in events:
                        event['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%S')
                        detected_events.append(event)
                        send_event_to_backend(event)
                        print(f'🚨 Event: {event["event_type"]} (confidence: {event["confidence"]:.2f})')

            time.sleep(1.0 / 15)  # ~15 FPS for simulation
        return

    # Real camera mode
    camera = cv2.VideoCapture(CAMERA_INDEX)
    if not camera.isOpened():
        print('⚠️  Could not open camera — switching to simulation mode')
        use_simulator = True
        camera_loop()
        return

    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    print(f'📹 Camera opened (index {CAMERA_INDEX})')

    while is_running:
        ret, frame = camera.read()
        if not ret:
            time.sleep(0.1)
            continue

        annotated, events = detector.process_frame(frame)
        latest_frame = annotated

        if events:
            with events_lock:
                for event in events:
                    event['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%S')
                    detected_events.append(event)
                    send_event_to_backend(event)
                    print(f'🚨 Event: {event["event_type"]} (confidence: {event["confidence"]:.2f})')

        time.sleep(1.0 / 30)  # ~30 FPS

    if camera:
        camera.release()
        print('📹 Camera released')


def generate_sim_frame(frame_num):
    """Generate a simulated camera frame for testing."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Background gradient
    for y in range(480):
        shade = int(30 + (y / 480) * 40)
        frame[y, :] = (shade, shade + 5, shade + 10)

    # Draw simulated counter / shelf
    cv2.rectangle(frame, (0, 350), (640, 480), (60, 50, 40), -1)

    # Draw simulated cash drawer
    drawer_color = (80, 80, 80) if frame_num % 200 < 150 else (120, 120, 120)
    cv2.rectangle(frame, (180, 310), (460, 420), drawer_color, -1)
    cv2.putText(frame, 'CASH DRAWER', (220, 370),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (180, 180, 180), 2)

    # Simulate hand movement
    t = frame_num * 0.05
    hand_x = int(320 + 180 * np.sin(t))
    hand_y = int(280 + 100 * np.sin(t * 0.7))

    # Draw simulated hand
    cv2.circle(frame, (hand_x, hand_y), 15, (180, 160, 140), -1)
    for angle_offset in range(5):
        fx = int(hand_x + 20 * np.cos(angle_offset * 0.6 - 0.8))
        fy = int(hand_y - 18 - angle_offset * 3)
        cv2.line(frame, (hand_x, hand_y), (fx, fy), (180, 160, 140), 3)

    # Timestamp overlay
    cv2.putText(frame, f'SIM {time.strftime("%H:%M:%S")}', (480, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 200), 1)
    cv2.putText(frame, f'Frame: {frame_num}', (480, 55),
        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)

    return frame


def generate_mjpeg():
    """Generate MJPEG stream for browser consumption."""
    while is_running:
        if latest_frame is not None:
            ret, buffer = cv2.imencode('.jpg', latest_frame,
                [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' +
                       buffer.tobytes() + b'\r\n')
        time.sleep(1.0 / 20)


# ─── API Routes ────────────────────────────────────────

@app.route('/api/cv/start', methods=['POST'])
def start_feed():
    """Start the camera feed and detection."""
    global is_running, use_simulator
    if is_running:
        return jsonify({'status': 'already running'}), 200

    data = request.get_json(silent=True) or {}
    use_simulator = data.get('simulate', False)

    is_running = True
    thread = threading.Thread(target=camera_loop, daemon=True)
    thread.start()
    return jsonify({'status': 'started', 'simulator': use_simulator}), 200


@app.route('/api/cv/stop', methods=['POST'])
def stop_feed():
    """Stop the camera feed."""
    global is_running
    is_running = False
    return jsonify({'status': 'stopped'}), 200


@app.route('/api/cv/feed')
def video_feed():
    """MJPEG video stream endpoint."""
    if not is_running:
        return jsonify({'error': 'Feed not started'}), 400
    return Response(generate_mjpeg(),
        mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/cv/status')
def status():
    """Get current detection status."""
    with events_lock:
        recent = list(detected_events[-10:])
    return jsonify({
        'running': is_running,
        'simulator': use_simulator,
        'frame_count': detector.frame_count,
        'recent_events': recent,
        'total_events': len(detected_events)
    })


@app.route('/api/cv/events')
def get_events():
    """Get all detected events."""
    with events_lock:
        limit = request.args.get('limit', 50, type=int)
        events_list = list(detected_events[-limit:])
    return jsonify(events_list)


@app.route('/api/cv/snapshot')
def snapshot():
    """Capture current frame as JPEG."""
    if latest_frame is None:
        return jsonify({'error': 'No frame available'}), 400
    ret, buffer = cv2.imencode('.jpg', latest_frame)
    if ret:
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    return jsonify({'error': 'Failed to encode frame'}), 500


@app.route('/api/cv/health')
def health():
    return jsonify({'status': 'ok', 'service': 'cv-service'})


# ─── Entry Point ───────────────────────────────────────
if __name__ == '__main__':
    print('🔬 Retail Theft Detection — CV Service')
    print('   Endpoints:')
    print('   POST /api/cv/start  — Start camera feed')
    print('   POST /api/cv/stop   — Stop camera feed')
    print('   GET  /api/cv/feed   — MJPEG stream')
    print('   GET  /api/cv/status — Detection status')
    print('')
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
