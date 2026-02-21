import cv2

def test_cameras():
    for i in range(5):
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                print(f"✅ Camera found at index {i}")
                cap.release()
                return i
            cap.release()
        else:
            print(f"❌ No camera at index {i}")
    return None

if __name__ == "__main__":
    idx = test_cameras()
    if idx is not None:
        print(f"RESULT_INDEX={idx}")
    else:
        print("RESULT_INDEX=NONE")
