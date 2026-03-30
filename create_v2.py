import urllib.request
import json
import ssl
import time

RENDER_API_KEY = "rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV"
OWNER_ID = "tea-d74nfluuk2gs73a8kltg"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def render_api(url, method="GET", data=None):
    headers = {
        "Authorization": f"Bearer {RENDER_API_KEY}",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            body = r.read().decode()
            if body:
                return json.loads(body), r.status
            return {}, r.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode()), e.code
        except:
            return {"error": str(e)}, e.code
    except Exception as e:
        return {"error": str(e)}, 0

print("=== Creating Web Service ===")

# Try different JSON structures
payload = {
    "name": "petpaw",
    "type": "web_service",
    "ownerId": OWNER_ID,
    "region": "oregon",
    "repo": "https://github.com/gta771771-ctrl/pet365-store",
    "branch": "main",
    "autoDeploy": True,
    "buildCommand": "npm install",
    "startCommand": "npm start",
    "plan": "free",
    "envVars": [
        {"key": "NODE_ENV", "value": "production"},
        {"key": "RENDER", "value": "true"}
    ]
}

# Try with JSON string
payload_str = json.dumps(payload)
print(f"Payload: {payload_str}")

result, code = render_api("https://api.render.com/v1/services", "POST", payload)
print(f"Response code: {code}")
print(f"Response: {json.dumps(result, indent=2)[:3000]}")

if code in [200, 201]:
    service_id = result.get("id")
    print(f"\n=== SUCCESS! Service ID: {service_id} ===")
