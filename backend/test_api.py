import traceback
import sys

with open("test_output.txt", "w") as f:
    try:
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        response = client.get('/api/dashboard/snapped-accidents?district=Surat')
        f.write(f"Status: {response.status_code}\n")
        f.write(f"Response: {response.json()}\n")
    except Exception as e:
        f.write(traceback.format_exc())
