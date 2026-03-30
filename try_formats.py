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

# Try Blueprint API format
blueprints = [
    # Try 1: Standard web service
    {
        "name": "petpaw",
        "serviceType": "web_service",
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
    },
    # Try 2: With server side rendering
    {
        "name": "petpaw",
        "type": "web_service",
        "serviceType": "web_service",
        "ownerId": OWNER_ID,
        "region": "oregon",
        "repo": "https://github.com/gta771771-ctrl/pet365-store",
        "branch": "main",
        "autoDeploy": "yes",
        "buildCommand": "npm install",
        "startCommand": "npm start",
        "plan": "free"
    },
    # Try 3: Simplified
    {
        "name": "petpaw",
        "type": "web_service",
        "ownerId": OWNER_ID,
        "region": "oregon",
        "repo": "https://github.com/gta771771-ctrl/pet365-store",
        "branch": "main",
        "plan": "free"
    }
]

url = "https://api.render.com/v1/services"
for i, payload in enumerate(blueprints):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, method="POST", headers=headers, data=body)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
            resp_body = response.read().decode('utf-8')
            print(f"Try {i+1}: SUCCESS!")
            print(resp_body[:1000])
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8')
        print(f"Try {i+1}: HTTP {e.code}: {resp_body[:300]}")
    except Exception as e:
        print(f"Try {i+1}: Error: {e}")

# Also try blueprint endpoint
print("\n=== Trying Blueprint endpoint ===")
blueprint_payload = {
    "ownerId": OWNER_ID,
    "repo": "https://github.com/gta771771-ctrl/pet365-store",
    "branch": "main",
    "name": "petpaw",
    "plan": "free",
    "region": "oregon"
}
body = json.dumps(blueprint_payload, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request("https://api.render.com/v1/blueprints", method="POST", headers=headers, data=body)
try:
    with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
        resp_body = response.read().decode('utf-8')
        print(f"Blueprint SUCCESS: {resp_body[:1000]}")
except urllib.error.HTTPError as e:
    resp_body = e.read().decode('utf-8')
    print(f"Blueprint HTTP {e.code}: {resp_body[:500]}")
except Exception as e:
    print(f"Blueprint Error: {e}")
