"""
Camera Simulator — Generates synthetic events for testing without a physical camera.
"""
import time
import json
import requests
import random

BACKEND_URL = 'http://localhost:5000'


def generate_event(event_type, cashier_id=None):
    """Send a simulated camera event to the backend."""
    events = {
        'hand_to_pocket': {
            'description': 'Simulated: Hand moved from drawer toward pocket area',
            'confidence': round(0.6 + random.random() * 0.35, 2),
            'risk_score': 35
        },
        'hand_hovering_drawer': {
            'description': 'Simulated: Hand lingering in cash drawer zone',
            'confidence': round(0.5 + random.random() * 0.4, 2),
            'risk_score': 15
        },
        'drawer_opened_no_pos': {
            'description': 'Simulated: Drawer opened without matching POS transaction',
            'confidence': round(0.7 + random.random() * 0.25, 2),
            'risk_score': 45
        },
        'drawer_forced_open': {
            'description': 'Simulated: Drawer opened with excessive force',
            'confidence': round(0.65 + random.random() * 0.3, 2),
            'risk_score': 50
        },
        'suspicious_gesture': {
            'description': 'Simulated: Unusual hand movement pattern detected',
            'confidence': round(0.4 + random.random() * 0.4, 2),
            'risk_score': 20
        },
        'normal': {
            'description': 'Simulated: Normal cash handling observed',
            'confidence': 0.95,
            'risk_score': 0
        }
    }

    event_data = events.get(event_type, events['normal'])

    payload = {
        'event_type': event_type,
        'cashier_id': cashier_id,
        'confidence': event_data['confidence'],
        'risk_score': event_data['risk_score'] * event_data['confidence'],
        'description': event_data['description'],
        'region_data': {
            'hand_position': {'x': random.uniform(0.2, 0.8), 'y': random.uniform(0.3, 0.9)},
            'drawer_state': 'open' if 'drawer' in event_type else 'closed'
        }
    }

    try:
        resp = requests.post(f'{BACKEND_URL}/api/camera/events', json=payload, timeout=3)
        result = resp.json()
        print(f'  ✅ Event sent: {event_type} (risk: {payload["risk_score"]:.1f}) — ID: {result.get("id", "?")}')
        return result
    except Exception as e:
        print(f'  ❌ Error sending event: {e}')
        return None


def run_simulation(duration_seconds=60, events_per_minute=10):
    """Run camera simulation, generating random events."""
    print(f'🎬 Camera Simulator Starting')
    print(f'   Duration: {duration_seconds}s | Events rate: ~{events_per_minute}/min')
    print(f'   Backend: {BACKEND_URL}\n')

    event_types = [
        'normal', 'normal', 'normal', 'normal',  # ~50% normal
        'hand_hovering_drawer', 'hand_hovering_drawer',  # ~25% mild suspicious
        'suspicious_gesture',
        'hand_to_pocket',  # ~12% moderate
        'drawer_opened_no_pos',  # ~12% serious
        'drawer_forced_open',
    ]

    start = time.time()
    event_count = 0
    interval = 60.0 / events_per_minute

    while time.time() - start < duration_seconds:
        event_type = random.choice(event_types)
        generate_event(event_type)
        event_count += 1

        # Random delay
        delay = interval * (0.5 + random.random())
        time.sleep(delay)

    print(f'\n✅ Simulation complete: {event_count} events generated in {duration_seconds}s')


if __name__ == '__main__':
    import sys
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    rate = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    run_simulation(duration, rate)
