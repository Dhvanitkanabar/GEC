"""
Retail Theft Detection — Computer Vision Detector Module
Hand tracking with MediaPipe, drawer monitoring, gesture classification.
Currency note detection using HSV color histograms for INR denominations.
"""
import cv2
import numpy as np
import time
import json
from collections import deque

# Rupee symbol — kept as a constant to avoid backslash-escape issues in f-strings (Python <3.12)
Rs = '\u20b9'

try:
    import mediapipe as mp
    _ = mp.solutions.hands
    MP_AVAILABLE = True
except (ImportError, AttributeError):
    MP_AVAILABLE = False
    print("⚠️  MediaPipe not available — running in simulation mode")


# ─── INR Note Denomination Config ─────────────────────────────────────────────
# Each denomination has an approximate HSV hue range for color-based detection.
# These are tuned for typical Indian rupee note colors under standard lighting.
INR_NOTES = [500, 200, 100, 50, 20, 10]  # descending for greedy algorithm

NOTE_COLORS = {
    10:  {'label': '₹10',  'hsv_lower': np.array([10, 40, 60]),   'hsv_upper': np.array([25, 255, 200]),  'bgr': (42, 42, 165)},   # Brown
    20:  {'label': '₹20',  'hsv_lower': np.array([20, 60, 100]),  'hsv_upper': np.array([35, 255, 255]),  'bgr': (0, 180, 255)},   # Yellow-Green
    50:  {'label': '₹50',  'hsv_lower': np.array([80, 50, 80]),   'hsv_upper': np.array([100, 255, 255]), 'bgr': (255, 200, 0)},   # Cyan-ish
    100: {'label': '₹100', 'hsv_lower': np.array([120, 30, 80]),  'hsv_upper': np.array([145, 200, 240]), 'bgr': (230, 160, 200)}, # Lavender
    200: {'label': '₹200', 'hsv_lower': np.array([5, 80, 100]),   'hsv_upper': np.array([18, 255, 255]),  'bgr': (0, 120, 255)},   # Orange
    500: {'label': '₹500', 'hsv_lower': np.array([0, 0, 80]),     'hsv_upper': np.array([180, 40, 200]),  'bgr': (130, 130, 130)}, # Stone-grey
}


def greedy_change(amount, denominations=None):
    """
    Compute the minimal set of INR notes to return as change.
    Returns a list of note values in descending order.
    Example: greedy_change(70) → [50, 20]
    """
    if denominations is None:
        denominations = INR_NOTES
    result = []
    remaining = int(round(amount))
    for note in sorted(denominations, reverse=True):
        while remaining >= note:
            result.append(note)
            remaining -= note
    return result


def is_note_needed(note_val, expected_change, picked_so_far):
    """
    Given what note was picked, determine if it's valid.
    Returns (valid: bool, reason: str)
    """
    optimal = greedy_change(expected_change)
    # Build expected count map
    from collections import Counter
    optimal_counts = Counter(optimal)
    picked_counts = Counter(picked_so_far)

    # Check if we still need this denomination
    needed_count = optimal_counts.get(note_val, 0)
    picked_count = picked_counts.get(note_val, 0)

    if needed_count == 0:
        return False, f"₹{note_val} not needed; optimal change {greedy_change(expected_change)}"
    if picked_count >= needed_count:
        return False, f"Already picked enough ₹{note_val} notes ({picked_count}/{needed_count})"
    return True, "ok"


class TheftDetector:
    """
    Core detection engine for physical theft monitoring.
    Uses MediaPipe Hands for hand tracking and custom logic for gesture + currency classification.
    All detection is continuous — no freezes after single event.
    """

    # Drawer region (configurable — default bottom-center of frame)
    DRAWER_REGION = {'x_min': 0.25, 'x_max': 0.75, 'y_min': 0.6, 'y_max': 0.95}

    # Pocket regions (left/right sides)
    POCKET_REGIONS = [
        {'x_min': 0.0,  'x_max': 0.30, 'y_min': 0.4, 'y_max': 0.9},
        {'x_min': 0.70, 'x_max': 1.0,  'y_min': 0.4, 'y_max': 0.9},
    ]

    def __init__(self):
        self.hand_history = deque(maxlen=30)
        self.drawer_state = 'closed'
        self.drawer_open_start = None
        self.last_event_time = 0
        self.last_pocket_event_time = 0
        self.last_currency_event_time = 0
        self.event_cooldown = 3        # seconds between same-type events
        self.currency_cooldown = 4     # seconds between currency events
        self.frame_count = 0

        # Currency detection state
        self.expected_change = 0
        self.picked_notes = []
        self.transaction_active = False
        self.optimal_notes = []        # computed from expected_change

        # Hand tracking
        self.last_known_hands = {}
        self.next_hand_id = 0

        # MediaPipe
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

    # ─── Public API ──────────────────────────────────────────────────────────

    def set_expected_change(self, amount):
        """Set the expected change amount for the current transaction."""
        self.expected_change = float(amount)
        self.picked_notes = []
        self.transaction_active = amount > 0
        self.optimal_notes = greedy_change(amount)
        print(f"💰 Detector: Expected change = ₹{amount}, optimal notes = {self.optimal_notes}")

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _point_in_region(self, x, y, region):
        return (region['x_min'] <= x <= region['x_max'] and
                region['y_min'] <= y <= region['y_max'])

    def _get_skin_blobs(self, frame):
        """Detect skin-colored blobs as a hand fallback."""
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower = np.array([0, 20, 70], dtype='uint8')
        upper = np.array([20, 255, 255], dtype='uint8')
        mask = cv2.inRange(hsv, lower, upper)
        mask = cv2.GaussianBlur(mask, (5, 5), 0)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        blobs = []
        h_f, w_f = frame.shape[:2]
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 500 < area < 15000:
                M = cv2.moments(cnt)
                if M['m00'] != 0:
                    cx = int(M['m10'] / M['m00']) / w_f
                    cy = int(M['m01'] / M['m00']) / h_f
                    blobs.append((cx, cy))
        return blobs

    def _classify_note_under_hand(self, frame, hand_cx, hand_cy):
        """
        Try to identify what denomination note is under the hand
        by sampling the HSV color in a region slightly below the hand center.
        Returns (denomination: int or None, confidence: float)
        """
        h_f, w_f = frame.shape[:2]
        # Sample region: a rectangle 15% width, 10% height, centered slightly below hand
        cx_px = int(hand_cx * w_f)
        cy_px = int(min(hand_cy + 0.06, 0.98) * h_f)  # slightly below hand
        rw = int(w_f * 0.12)
        rh = int(h_f * 0.07)

        x1 = max(0, cx_px - rw)
        x2 = min(w_f, cx_px + rw)
        y1 = max(0, cy_px - rh)
        y2 = min(h_f, cy_px + rh)

        region = frame[y1:y2, x1:x2]
        if region.size == 0:
            return None, 0.0

        hsv_region = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        best_match = None
        best_score = 0

        for denom, cfg in NOTE_COLORS.items():
            mask = cv2.inRange(hsv_region, cfg['hsv_lower'], cfg['hsv_upper'])
            score = np.sum(mask > 0) / max(mask.size, 1)
            if score > best_score:
                best_score = score
                best_match = denom

        # Only trust if at least 15% of pixels match
        if best_score > 0.15:
            return best_match, min(0.5 + best_score, 0.95)
        return None, 0.0

    def _draw_regions(self, frame):
        """Draw monitoring overlay on frame."""
        h_f, w_f = frame.shape[:2]

        # Drawer zone
        d = self.DRAWER_REGION
        cv2.rectangle(frame,
            (int(d['x_min'] * w_f), int(d['y_min'] * h_f)),
            (int(d['x_max'] * w_f), int(d['y_max'] * h_f)),
            (100, 100, 100), 1)
        cv2.putText(frame, 'DRAWER ZONE', (int(d['x_min'] * w_f) + 4, int(d['y_min'] * h_f) + 16),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 120), 1)

        # Pocket zones
        for p in self.POCKET_REGIONS:
            cv2.rectangle(frame,
                (int(p['x_min'] * w_f), int(p['y_min'] * h_f)),
                (int(p['x_max'] * w_f), int(p['y_max'] * h_f)),
                (60, 60, 140), 1)

        # Currency info overlay
        if self.transaction_active:
            overlay = frame.copy()
            cv2.rectangle(overlay, (4, 4), (360, 90), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
            cv2.putText(frame, f'Change Due: {Rs}{self.expected_change:.0f}', (8, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 100), 2)
            optimal_str = " + ".join([f"{Rs}{n}" for n in self.optimal_notes]) or "Exact"
            cv2.putText(frame, f'Optimal: {optimal_str}', (8, 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 220, 255), 1)
            picked_str = "None" if not self.picked_notes else "+".join([f"{Rs}{n}" for n in self.picked_notes])
            cv2.putText(frame, f'Picked:  {picked_str}', (8, 68),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)

        return frame

    # ─── Currency Note Validation ─────────────────────────────────────────────

    def _validate_note_pick(self, picked_note):
        """
        Validate a note that was picked from the drawer.
        Returns list of alert events (may be empty for correct picks).
        """
        alerts = []
        now = time.time()

        # Cooldown to avoid rapid duplicate triggers
        if now - self.last_currency_event_time < self.currency_cooldown:
            return []

        if not self.transaction_active or self.expected_change <= 0:
            return []

        from collections import Counter
        optimal = self.optimal_notes
        optimal_counts = Counter(optimal)
        picked_counts = Counter(self.picked_notes)

        # Check 1: Note is too large / not needed
        needed = optimal_counts.get(picked_note, 0)
        already_picked = picked_counts.get(picked_note, 0)

        if needed == 0:
            alerts.append({
                'event_type': 'currency_anomaly',
                'confidence': 0.92,
                'risk_score': 65,
                'description': (
                    f'WRONG NOTE: Cashier picked {Rs}{picked_note} but it is not needed. '
                    f'Change {Rs}{self.expected_change:.0f} requires: {" + ".join([f"{Rs}{n}" for n in optimal])}'
                )
            })
            self.last_currency_event_time = now
        elif already_picked >= needed:
            alerts.append({
                'event_type': 'currency_anomaly',
                'confidence': 0.88,
                'risk_score': 55,
                'description': (
                    f'EXTRA NOTE: Already picked {already_picked} x {Rs}{picked_note}, '
                    f'only {needed} needed for {Rs}{self.expected_change:.0f} change'
                )
            })
            self.last_currency_event_time = now
        else:
            # Correct pick
            alerts.append({
                'event_type': 'cash_picked_correct',
                'confidence': 0.85,
                'risk_score': 0,
                'description': f'Correct: Cashier picked {Rs}{picked_note} for {Rs}{self.expected_change:.0f} change'
            })

        self.picked_notes.append(picked_note)

        # Check 2: Total picked now exceeds needed
        total_picked = sum(self.picked_notes)
        if total_picked > self.expected_change + 1:
            alerts.append({
                'event_type': 'currency_anomaly',
                'confidence': 0.95,
                'risk_score': 80,
                'description': (
                    f'OVERPICK: Total notes picked {Rs}{total_picked} exceeds change due {Rs}{self.expected_change:.0f}. '
                    f'Possible misappropriation!'
                )
            })
            self.last_currency_event_time = now

        # Check 3: High-denomination note picked unnecessarily
        if picked_note >= 50 and picked_note not in optimal:
            alerts.append({
                'event_type': 'currency_anomaly',
                'confidence': 0.95,
                'risk_score': 75,
                'description': (
                    f'HIGH DENOM ALERT: {Rs}{picked_note} picked but not required. '
                    f'Only small notes needed for {Rs}{self.expected_change:.0f}'
                )
            })

        return alerts

    # ─── Gesture Classification ───────────────────────────────────────────────

    def _classify_gesture(self, hand_landmarks, handedness, frame):
        """
        Classify hand gesture based on landmark positions.
        Now continuous — events are gated by cooldown timers, not one-shot flags.
        """
        wrist = hand_landmarks.landmark[0]
        index_tip = hand_landmarks.landmark[8]
        middle_tip = hand_landmarks.landmark[12]
        pinky_tip = hand_landmarks.landmark[20]

        cx = (wrist.x + index_tip.x + middle_tip.x) / 3
        cy = (wrist.y + index_tip.y + middle_tip.y) / 3

        events = []
        now = time.time()
        global_cooldown_ok = (now - self.last_event_time) > self.event_cooldown

        # ── Drawer zone ──────────────────────────────────────────────────────
        in_drawer = self._point_in_region(cx, cy, self.DRAWER_REGION)
        self.hand_history.append({'x': cx, 'y': cy, 'time': now, 'in_drawer': in_drawer})

        if in_drawer:
            # Grabbing/pinching motion (fingers close together)
            finger_spread = abs(index_tip.x - pinky_tip.x) + abs(index_tip.y - pinky_tip.y)
            is_grabbing = finger_spread < 0.07

            if is_grabbing and self.transaction_active and global_cooldown_ok:
                # Try to classify what note is being picked
                detected_denom, note_conf = self._classify_note_under_hand(frame, cx, cy)

                if detected_denom is not None:
                    currency_alerts = self._validate_note_pick(detected_denom)
                    events.extend(currency_alerts)
                    self.last_event_time = now
                else:
                    # Simulation fallback when no color match
                    # Pick the next note from optimal list that hasn't been picked yet
                    from collections import Counter
                    picked_counts = Counter(self.picked_notes)
                    sim_note = None
                    for note in self.optimal_notes:
                        if picked_counts.get(note, 0) < Counter(self.optimal_notes).get(note, 1):
                            sim_note = note
                            break
                    if sim_note is None and self.optimal_notes:
                        sim_note = 50  # pick an extra wrong note to trigger anomaly
                    if sim_note:
                        currency_alerts = self._validate_note_pick(sim_note)
                        events.extend(currency_alerts)
                        self.last_event_time = now

            # Hovering alert
            drawer_frames = sum(1 for h in self.hand_history if h.get('in_drawer', False))
            if drawer_frames > 20 and global_cooldown_ok:
                events.append({
                    'event_type': 'hand_hovering_drawer',
                    'confidence': min(0.95, drawer_frames / 30),
                    'risk_score': 15,
                    'description': 'Hand lingering in drawer zone'
                })
                self.last_event_time = now

        # ── Pocket zone ──────────────────────────────────────────────────────
        pocket_cooldown_ok = (now - self.last_pocket_event_time) > self.event_cooldown
        for region in self.POCKET_REGIONS:
            if self._point_in_region(cx, cy, region) and pocket_cooldown_ok:
                recent_drawer = any(h.get('in_drawer', False) for h in list(self.hand_history)[-25:])
                risk = 85 if recent_drawer else 35
                events.append({
                    'event_type': 'hand_to_pocket',
                    'confidence': 0.9,
                    'risk_score': risk,
                    'description': 'Hand entered pocket region' + (' after drawer access' if recent_drawer else '')
                })
                self.last_pocket_event_time = now
                break  # only one pocket event per frame

        # ── Rapid withdrawal ─────────────────────────────────────────────────
        if len(self.hand_history) > 10 and global_cooldown_ok:
            h_prev = list(self.hand_history)[-10]
            if h_prev.get('in_drawer') and not in_drawer:
                dist = np.sqrt((cx - h_prev['x'])**2 + (cy - h_prev['y'])**2)
                if dist > 0.35:
                    events.append({
                        'event_type': 'suspicious_gesture',
                        'confidence': 0.88,
                        'risk_score': 65,
                        'description': 'Rapid hand withdrawal from drawer'
                    })
                    self.last_event_time = now

        return events, (cx, cy)

    # ─── Main Frame Processor ─────────────────────────────────────────────────

    def process_frame(self, frame):
        """
        Process a single video frame continuously.
        Returns: (annotated_frame, detected_events)
        Detection never freezes — cooldown timers gate each event type independently.
        """
        self.frame_count += 1
        events = []
        annotated = frame.copy()
        now = time.time()

        # 1. Draw monitoring zones
        annotated = self._draw_regions(annotated)

        # 2. Hand detection
        active_hands = []

        if self.hands and MP_AVAILABLE:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb_frame)

            if results.multi_hand_landmarks:
                for idx, hl in enumerate(results.multi_hand_landmarks):
                    self.mp_draw.draw_landmarks(annotated, hl, self.mp_hands.HAND_CONNECTIONS)
                    handedness = 'Right'
                    if results.multi_handedness:
                        handedness = results.multi_handedness[idx].classification[0].label
                    hand_events, center = self._classify_gesture(hl, handedness, frame)
                    events.extend(hand_events)
                    active_hands.append(center)
                    # Draw detected note denomination badge on frame
                    denom, conf = self._classify_note_under_hand(frame, center[0], center[1])
                    if denom and conf > 0.2:
                        h_f, w_f = annotated.shape[:2]
                        cx_px = int(center[0] * w_f)
                        cy_px = int(center[1] * h_f)
                        ctx = NOTE_COLORS[denom]
                        cv2.circle(annotated, (cx_px, cy_px), 22, ctx['bgr'], 2)
                        cv2.putText(annotated, f"[{ctx['label']}]", (cx_px - 20, cy_px - 28),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, ctx['bgr'], 2)
            else:
                # Fallback: skin blob detection
                blobs = self._get_skin_blobs(frame)
                for bx, by in blobs:
                    active_hands.append((bx, by))
                    pockets = self.POCKET_REGIONS
                    pocket_ok = (now - self.last_pocket_event_time) > self.event_cooldown
                    for region in pockets:
                        if self._point_in_region(bx, by, region) and pocket_ok:
                            events.append({
                                'event_type': 'hand_to_pocket',
                                'confidence': 0.72,
                                'risk_score': 40,
                                'description': 'Skin-colored object detected in pocket region'
                            })
                            self.last_pocket_event_time = now
                            break
        else:
            # No MediaPipe at all — purely skin blobs
            blobs = self._get_skin_blobs(frame)
            for bx, by in blobs:
                active_hands.append((bx, by))
                pocket_ok = (now - self.last_pocket_event_time) > self.event_cooldown
                for region in self.POCKET_REGIONS:
                    if self._point_in_region(bx, by, region) and pocket_ok:
                        events.append({
                            'event_type': 'hand_to_pocket',
                            'confidence': 0.68,
                            'risk_score': 35,
                            'description': 'Hand/object detected in pocket zone (no MediaPipe)'
                        })
                        self.last_pocket_event_time = now
                        break

        # Draw active hand centers
        h_f, w_f = annotated.shape[:2]
        for bx, by in active_hands:
            cv2.circle(annotated, (int(bx * w_f), int(by * h_f)), 5, (0, 255, 255), -1)

        # ─── Hand disappearance (pocket hiding) ───────────────────────────
        pocket_ok = (now - self.last_pocket_event_time) > self.event_cooldown
        for h_id, h_data in list(self.last_known_hands.items()):
            found = any(
                np.sqrt((c[0] - h_data['pos'][0])**2 + (c[1] - h_data['pos'][1])**2) < 0.12
                for c in active_hands
            )
            if not found:
                for p in self.POCKET_REGIONS:
                    if self._point_in_region(h_data['pos'][0], h_data['pos'][1], p) and pocket_ok:
                        events.append({
                            'event_type': 'hand_to_pocket',
                            'confidence': 0.95,
                            'risk_score': 90,
                            'description': 'Hand disappeared inside pocket region — possible theft!'
                        })
                        self.last_pocket_event_time = now
                del self.last_known_hands[h_id]

        # Update tracking
        new_known = {}
        for c in active_hands:
            matched_id = None
            for h_id, h_data in self.last_known_hands.items():
                if np.sqrt((c[0] - h_data['pos'][0])**2 + (c[1] - h_data['pos'][1])**2) < 0.12:
                    matched_id = h_id
                    break
            key = matched_id if matched_id is not None else self.next_hand_id
            new_known[key] = {'pos': c, 'time': now}
            if matched_id is None:
                self.next_hand_id += 1
        self.last_known_hands = new_known

        # ─── Status overlay (top-right corner) ───────────────────────────
        if events:
            has_alert = any(e['risk_score'] >= 25 for e in events)
            color = (0, 0, 255) if has_alert else (0, 165, 255)
            cv2.putText(annotated, f'ALERT: {len(events)}', (w_f - 145, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, color, 2)

        # Frame counter (bottom right)
        cv2.putText(annotated, f'F:{self.frame_count}', (w_f - 60, h_f - 8),
            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (80, 80, 80), 1)

        return annotated, events

    def cleanup(self):
        """Release resources."""
        if self.hands and MP_AVAILABLE:
            self.hands.close()
