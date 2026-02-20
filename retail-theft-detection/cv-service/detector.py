"""
Retail Theft Detection — Computer Vision Detector Module
Hand tracking with MediaPipe, drawer monitoring, gesture classification, face blurring.
"""
import cv2
import numpy as np
import time
import json
from collections import deque

try:
    import mediapipe as mp
    MP_AVAILABLE = True
except ImportError:
    MP_AVAILABLE = False
    print("⚠️  MediaPipe not available — running in simulation mode")


class TheftDetector:
    """
    Core detection engine for physical theft monitoring.
    Uses MediaPipe Hands for hand tracking and custom logic for gesture classification.
    """

    # Drawer region (configurable — default is bottom-center of frame)
    DRAWER_REGION = {
        'x_min': 0.25, 'x_max': 0.75,
        'y_min': 0.6, 'y_max': 0.95
    }

    # Pocket regions (left/right sides of frame)
    POCKET_REGIONS = [
        {'x_min': 0.0, 'x_max': 0.15, 'y_min': 0.4, 'y_max': 0.8},   # Left pocket
        {'x_min': 0.85, 'x_max': 1.0, 'y_min': 0.4, 'y_max': 0.8},    # Right pocket
    ]

    def __init__(self):
        self.hand_history = deque(maxlen=30)  # Last 30 frames of hand positions
        self.drawer_state = 'closed'
        self.drawer_open_start = None
        self.last_event_time = 0
        self.event_cooldown = 3  # Minimum seconds between same events
        self.frame_count = 0

        # Face detection for privacy blurring
        try:
            self.face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
        except Exception:
            self.face_cascade = None

        # MediaPipe Hands
        if MP_AVAILABLE:
            self.mp_hands = mp.solutions.hands
            self.hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self.mp_draw = mp.solutions.drawing_utils
        else:
            self.hands = None

    def _point_in_region(self, x, y, region):
        """Check if normalized point (x,y) is within a region."""
        return (region['x_min'] <= x <= region['x_max'] and
                region['y_min'] <= y <= region['y_max'])

    def _blur_faces(self, frame):
        """Blur detected faces for privacy protection."""
        if self.face_cascade is None:
            return frame

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)

        for (x, y, w, h) in faces:
            face_region = frame[y:y+h, x:x+w]
            blurred = cv2.GaussianBlur(face_region, (99, 99), 30)
            frame[y:y+h, x:x+w] = blurred

        return frame

    def _draw_regions(self, frame):
        """Draw monitoring regions on frame."""
        h, w = frame.shape[:2]

        # Drawer region
        dr = self.DRAWER_REGION
        cv2.rectangle(frame,
            (int(dr['x_min'] * w), int(dr['y_min'] * h)),
            (int(dr['x_max'] * w), int(dr['y_max'] * h)),
            (0, 255, 255), 2)
        cv2.putText(frame, 'DRAWER ZONE', (int(dr['x_min'] * w) + 5, int(dr['y_min'] * h) + 20),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        # Pocket regions
        for i, pr in enumerate(self.POCKET_REGIONS):
            cv2.rectangle(frame,
                (int(pr['x_min'] * w), int(pr['y_min'] * h)),
                (int(pr['x_max'] * w), int(pr['y_max'] * h)),
                (0, 0, 255), 2)
            cv2.putText(frame, f'POCKET {i+1}', (int(pr['x_min'] * w) + 5, int(pr['y_min'] * h) + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

        return frame

    def _classify_gesture(self, hand_landmarks, handedness):
        """
        Classify hand gesture based on landmark positions.
        Returns gesture type and confidence.
        """
        # Get key landmarks
        wrist = hand_landmarks.landmark[0]
        index_tip = hand_landmarks.landmark[8]
        middle_tip = hand_landmarks.landmark[12]
        ring_tip = hand_landmarks.landmark[16]
        pinky_tip = hand_landmarks.landmark[20]
        thumb_tip = hand_landmarks.landmark[4]

        # Calculate hand center
        cx = (wrist.x + index_tip.x + middle_tip.x) / 3
        cy = (wrist.y + index_tip.y + middle_tip.y) / 3

        events = []
        now = time.time()

        # Check if hand is in drawer region
        if self._point_in_region(cx, cy, self.DRAWER_REGION):
            # Check for hovering (hand staying in drawer area)
            self.hand_history.append({'x': cx, 'y': cy, 'time': now, 'in_drawer': True})

            # Count recent frames in drawer
            drawer_frames = sum(1 for h in self.hand_history if h.get('in_drawer', False))
            if drawer_frames > 10 and now - self.last_event_time > self.event_cooldown:
                events.append({
                    'event_type': 'hand_hovering_drawer',
                    'confidence': min(0.95, drawer_frames / 30),
                    'risk_score': 15 * min(0.95, drawer_frames / 30),
                    'description': f'Hand lingering in drawer zone for {drawer_frames} frames'
                })
                self.last_event_time = now
        else:
            self.hand_history.append({'x': cx, 'y': cy, 'time': now, 'in_drawer': False})

        # Check for hand-to-pocket movement
        for region in self.POCKET_REGIONS:
            if self._point_in_region(cx, cy, region):
                # Check if hand was recently in drawer
                recent_drawer = any(h.get('in_drawer', False) for h in list(self.hand_history)[-15:])
                if recent_drawer and now - self.last_event_time > self.event_cooldown:
                    events.append({
                        'event_type': 'hand_to_pocket',
                        'confidence': 0.7,
                        'risk_score': 35,
                        'description': 'Hand moved from drawer area toward pocket region'
                    })
                    self.last_event_time = now

        # Check for grabbing motion (fingers closing)
        finger_spread = abs(index_tip.x - pinky_tip.x) + abs(index_tip.y - pinky_tip.y)
        if finger_spread < 0.05 and self._point_in_region(cx, cy, self.DRAWER_REGION):
            if now - self.last_event_time > self.event_cooldown:
                events.append({
                    'event_type': 'suspicious_gesture',
                    'confidence': 0.6,
                    'risk_score': 20,
                    'description': 'Grabbing motion detected in drawer zone'
                })
                self.last_event_time = now

        return events, (cx, cy)

    def process_frame(self, frame):
        """
        Process a single video frame.
        Returns: (annotated_frame, detected_events)
        """
        self.frame_count += 1
        events = []
        annotated = frame.copy()

        # Privacy: blur faces
        annotated = self._blur_faces(annotated)

        # Draw monitoring regions
        annotated = self._draw_regions(annotated)

        # Hand detection
        if self.hands and MP_AVAILABLE:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb_frame)

            if results.multi_hand_landmarks:
                for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                    # Draw hand landmarks
                    self.mp_draw.draw_landmarks(
                        annotated, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)

                    # Get handedness
                    handedness = 'Right'
                    if results.multi_handedness:
                        handedness = results.multi_handedness[idx].classification[0].label

                    # Classify gesture
                    hand_events, center = self._classify_gesture(hand_landmarks, handedness)
                    events.extend(hand_events)

                    # Draw hand center
                    h_frame, w_frame = annotated.shape[:2]
                    cv2.circle(annotated,
                        (int(center[0] * w_frame), int(center[1] * h_frame)),
                        8, (0, 255, 0), -1)

        # Add status overlay
        status_color = (0, 255, 0) if not events else (0, 0, 255)
        status_text = 'NORMAL' if not events else f'⚠ {len(events)} ALERT(S)'
        cv2.putText(annotated, status_text, (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        cv2.putText(annotated, f'Frame: {self.frame_count}', (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        return annotated, events

    def cleanup(self):
        """Release resources."""
        if self.hands and MP_AVAILABLE:
            self.hands.close()
