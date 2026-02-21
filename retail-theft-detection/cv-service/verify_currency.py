import requests
import time

CV_URL = "http://localhost:5001/api/cv"

def test_currency_flow():
    print("🚀 Starting Currency Detection Simulation Test")
    
    # 1. Start Feed
    requests.post(f"{CV_URL}/start", json={"simulate": True})
    print("✅ Feed Started")
    
    # 2. Set Expected Change (30 INR)
    requests.post(f"{CV_URL}/expected-change", json={"amount": 30})
    print("✅ Expected Change set to 30 INR")
    
    # 3. Wait and monitor status
    for i in range(15):
        status = requests.get(f"{CV_URL}/status").json()
        print(f"[{i}] Status: Expected={status['expected_change']}, Total Events={status['total_events']}")
        
        # Check for currency anomalies
        for event in status.get('recent_events', []):
            if event['event_type'] == 'currency_anomaly':
                print(f"🚨 ANOMALY DETECTED: {event['description']}")
                return True
        
        time.sleep(2)
    
    print("❌ Test Timed Out - No anomaly detected")
    return False

if __name__ == "__main__":
    test_currency_flow()
