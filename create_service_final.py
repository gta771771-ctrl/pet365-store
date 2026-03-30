import urllib.request
import json
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

RENDER_API_KEY = "rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV"
OWNER_ID = "tea-d74nfluuk2gs73a8kltg"

headers = {
    "Authorization": f"Bearer {RENDER_API_KEY}",
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json"
}

print("=== Creating Web Service with serviceDetails ===")

payload = {
    "name": "petpaw",
    "type": "web_service",
    "ownerId": OWNER_ID,
    "region": "oregon",
    "repo": "https://github.com/gta771771-ctrl/pet365-store",
    "branch": "main",
    "autoDeploy": True,
    "plan": "free",
    "serviceDetails": {
        "buildCommand": "npm install",
        "startCommand": "npm start",
        "healthCheckPath": "/",
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "RENDER", "value": "true"},
            {"key": "BCRYPT_ROUNDS", "value": "10"}
        ]
    }
}

body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
print(f"Payload: {body.decode()}")

url = "https://api.render.com/v1/services"
req = urllib.request.Request(url, method="POST", headers=headers, data=body)

try:
    with urllib.request.urlopen(req, timeout=60, context=ctx) as response:
        resp_body = response.read().decode('utf-8')
        resp_data = json.loads(resp_body)
        print(f"\n=== SUCCESS! Service Created! ===")
        print(f"Service ID: {resp_data.get('id')}")
        print(f"Service Name: {resp_data.get('name')}")
        print(f"Status: {resp_data.get('status')}")
        
        service_id = resp_data.get('id')
        
        # Wait for deployment
        print(f"\nWaiting for deployment (checking every 30 seconds)...")
        for i in range(20):
            time.sleep(30)
            status_req = urllib.request.Request(
                f"https://api.render.com/v1/services/{service_id}",
                method="GET",
                headers=headers
            )
            with urllib.request.urlopen(status_req, timeout=30, context=ctx) as r:
                status_data = json.loads(r.read().decode())
                deploy = status_data.get('latestDeploy', {})
                deploy_status = deploy.get('status', 'unknown')
                print(f"  Check {i+1}: {deploy_status}")
                if deploy_status == 'live':
                    print(f"\n=== DEPLOYED! ===")
                    print(f"URL: https://petpaw.onrender.com")
                    break
        else:
            print("Deployment still in progress...")
            
except urllib.error.HTTPError as e:
    resp_body = e.read().decode('utf-8')
    print(f"HTTP Error {e.code}: {resp_body}")
except Exception as e:
    print(f"Error: {e}")
