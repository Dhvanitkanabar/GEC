import cv2
import numpy as np
import time
import json
import threading
import requests
import os
from collections import deque
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
BUFFER_SECONDS = 20
FPS_FOR_BUFFER = 10
MAX_BUFFER_SIZE = BUFFER_SECONDS * FPS_FOR_BUFFER

def find_working_camera():
    """Find the first available camera index."""
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                cap.release()
                print(f"[OK] Found working camera at index {i}")
                return i
            cap.release()
    return None  # No camera found

def make_offline_frame(message="Camera Offline"):
    """Generate a blank 'camera offline' frame so MJPEG stream never blocks."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:] = (20, 20, 30)
    cv2.putText(frame, message, (160, 220),
        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (80, 80, 100), 2)
    cv2.putText(frame, time.strftime('%H:%M:%S'), (260, 270),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 60, 80), 1)
    cv2.putText(frame, 'RetailGuard Monitoring', (170, 310),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 70, 100), 1)
    return frame

# ─── Global State ──────────────────────────────────────
print("[INFO] Scanning for cameras...")
camera_index = find_working_camera()
if camera_index is not None:
    print(f"[INFO] Default camera_index: {camera_index}")
else:
    print("[WARN] No physical camera found. Will serve offline frames.")

detector = TheftDetector()
camera = None
is_running = False
latest_frame = make_offline_frame()   # start with offline frame, not None
detected_events = []
events_lock = threading.Lock()

frame_buffer = deque(maxlen=MAX_BUFFER_SIZE)
buffer_lock = threading.Lock()
camera_lock = threading.Lock()


def send_event_to_backend(event):
    """Forward detected event to Node.js backend."""
    def _send():
        try:
            should_record = event.get('risk_score', 0) >= 30 or event.get('event_type') in ('currency_anomaly', 'hand_to_pocket')
            if should_record:
                ts = int(time.time() * 1000)
                clip_name = f'anomaly_{ts}.mp4'
                threading.Thread(target=save_and_upload_clip, args=(clip_name, event.copy()), daemon=True).start()

            requests.post(f'{BACKEND_URL}/api/camera/events', json=event, timeout=3)
        except Exception as e:
            print(f'[WARN] Could not send event: {e}')

    threading.Thread(target=_send, daemon=True).start()


def save_and_upload_clip(filename, event):
    """Save the current buffer to a video file and upload to backend."""
    try:
        temp_path = os.path.join(os.getcwd(), filename)
        with buffer_lock:
            frames = list(frame_buffer)
        if not frames:
            return

        h, w = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_path, fourcc, FPS_FOR_BUFFER, (w, h))
        if not out.isOpened():
            print(f'[WARN] Failed to open VideoWriter for {temp_path}')
            return

        for f in frames:
            out.write(f)
        out.release()
        print(f'📁 Saved clip: {filename}')

        with open(temp_path, 'rb') as f:
            files = {'clip': (filename, f, 'video/mp4')}
            data = {'event_id': event.get('id'), 'filename': filename}
            requests.post(f'{BACKEND_URL}/api/camera/clips', files=files, data=data, timeout=10)
        print(f'🚀 Uploaded clip {filename}')
        os.remove(temp_path)
    except Exception as e:
        print(f'[WARN] Clip error: {e}')
        if 'temp_path' in locals() and os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass


def camera_loop():
    """Main camera capture loop — always running, reconnects if camera fails."""
    global camera, is_running, latest_frame, frame_buffer, camera_index

    if camera_index is None:
        print('[INFO] No camera available — streaming offline frames')
        frame_num = 0
        while is_running:
            latest_frame = make_offline_frame(f"No Camera — Frame {frame_num}")
            frame_num += 1
            time.sleep(1.0 / 15)
        return

    print(f'[INFO] Opening camera index {camera_index}')
    consecutive_failures = 0

    while is_running:
        # Open (or reopen) camera
        with camera_lock:
            if camera is None or not camera.isOpened():
                cam_idx = find_working_camera()
                if cam_idx is None:
                    latest_frame = make_offline_frame("Camera Unavailable")
                    time.sleep(2)
                    continue
                camera_index = cam_idx
                camera = cv2.VideoCapture(camera_index)
                camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                print(f'[OK] Camera {camera_index} opened')
                consecutive_failures = 0

        with camera_lock:
            ret, frame = camera.read()

        if not ret:
            consecutive_failures += 1
            print(f"[WARN] Frame read failed ({consecutive_failures})")
            latest_frame = make_offline_frame("Camera Read Error")
            if consecutive_failures >= 5:
                # Force reopen on next iteration
                with camera_lock:
                    if camera:
                        camera.release()
                        camera = None
                consecutive_failures = 0
            time.sleep(0.5)
            continue

        consecutive_failures = 0

        # Process frame
        annotated, events = detector.process_frame(frame)
        latest_frame = annotated

        # Buffer for clip recording
        loop_count = getattr(camera_loop, '_count', 0) + 1
        camera_loop._count = loop_count
        if loop_count % 3 == 0:
            with buffer_lock:
                frame_buffer.append(annotated)

        # Dispatch events
        if events:
            for event in events:
                event['timestamp'] = time.strftime('%Y-%m-%dT%H:%M:%S')
                with events_lock:
                    detected_events.append(event)
                send_event_to_backend(event)
                print(f'[EVENT] {event["event_type"]} risk={event["risk_score"]}')

        # Heartbeat
        if loop_count % 150 == 0:
            print(f"[HEARTBEAT] Frame {loop_count}, events captured: {len(detected_events)}")

        time.sleep(0.01)

    with camera_lock:
        if camera:
            camera.release()
            camera = None
    print('[INFO] Camera loop exited')


def generate_mjpeg():
    """Generate MJPEG stream — never blocks, serves offline frame if needed."""
    while True:
        frame = latest_frame
        if frame is None:
            frame = make_offline_frame()
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
        if ret:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' +
                   buffer.tobytes() + b'\r\n')
        time.sleep(1.0 / 20)  # 20 FPS stream


# ─── API Routes ────────────────────────────────────────

@app.route('/api/cv/start', methods=['POST'])
def start_feed():
    global is_running
    if is_running:
        return jsonify({'status': 'already_running'}), 200
    is_running = True
    threading.Thread(target=camera_loop, daemon=True).start()
    return jsonify({'status': 'started'}), 200


@app.route('/api/cv/stop', methods=['POST'])
def stop_feed():
    global is_running
    is_running = False
    return jsonify({'status': 'stopped'}), 200


@app.route('/api/cv/feed')
def video_feed():
    """MJPEG stream — always available even when camera is offline."""
    return Response(generate_mjpeg(),
        mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/cv/status')
def status():
    with events_lock:
        recent = list(detected_events[-10:])
    return jsonify({
        'running': is_running,
        'simulator': False,
        'frame_count': detector.frame_count,
        'recent_events': recent,
        'total_events': len(detected_events),
        'expected_change': detector.expected_change,
        'optimal_notes': detector.optimal_notes,
        'picked_notes': detector.picked_notes,
        'camera_index': camera_index,
    })


@app.route('/api/cv/expected-change', methods=['POST'])
def set_expected_change():
    data = request.get_json()
    amount = data.get('amount', 0)
    detector.set_expected_change(amount)
    return jsonify({
        'status': 'ok',
        'expected_change': amount,
        'optimal_notes': detector.optimal_notes
    })


@app.route('/api/cv/events')
def get_events():
    with events_lock:
        limit = request.args.get('limit', 50, type=int)
        events_list = list(detected_events[-limit:])
    return jsonify(events_list)


@app.route('/api/cv/snapshot')
def snapshot():
    frame = latest_frame or make_offline_frame()
    ret, buffer = cv2.imencode('.jpg', frame)
    if ret:
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    return jsonify({'error': 'Failed to encode'}), 500


@app.route('/api/cv/health')
def health():
    return jsonify({'status': 'ok', 'service': 'cv-service', 'camera_index': camera_index})


# ─── Entry Point ───────────────────────────────────────
if __name__ == '__main__':
    # Always start camera loop at startup
    is_running = True
    t = threading.Thread(target=camera_loop, daemon=True)
    t.start()
    print(f"🚀 CV Service starting on :5001  (camera={camera_index})")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
