import urllib.request
import json
import ssl

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

body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
print(f"Body length: {len(body)}")

url = "https://api.render.com/v1/services"
req = urllib.request.Request(url, method="POST", headers=headers, data=body)

try:
    with urllib.request.urlopen(req, timeout=60, context=ctx) as response:
        resp_body = response.read().decode('utf-8')
        print(f"Success! Status: {response.status}")
        print(f"Response: {resp_body[:2000]}")
except urllib.error.HTTPError as e:
    resp_body = e.read().decode('utf-8')
    print(f"HTTP Error {e.code}: {resp_body}")
except Exception as e:
    print(f"Error: {e}")
