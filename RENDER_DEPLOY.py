import urllib.request
import json
import ssl

RENDER_API_KEY = "rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def render_api(url, method="GET", data=None):
    headers = {
        "Authorization": f"Bearer {RENDER_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except:
            return {"error": str(e)}, e.code
    except Exception as e:
        return {"error": str(e)}, 0

print("=== Step 1: Testing Render API ===")
test, code = render_api("https://api.render.com/v1/services")
print(f"Status: {code}")
if code == 200:
    print(f"Connected! Found {len(test)} services")
elif code == 401:
    print(f"Auth failed: {test}")
elif code == 403:
    print(f"Forbidden - check API key permissions: {test}")
else:
    print(f"Response: {test}")

print("\n=== Step 2: Creating Web Service ===")
# Create a new web service from GitHub repo
new_service, code = render_api("https://api.render.com/v1/services", "POST", {
    "service": {
        "name": "petpaw",
        "region": "oregon",
        "serviceType": "web",
        "ownerId": "me",
        "source": {
            "type": "github",
            "repo": "gta771771-ctrl/pet365-store",
            "branch": "main",
            "autoDeploy": True,
            "shouldRebuild": True
        },
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "RENDER", "value": "true"},
            {"key": "BCRYPT_ROUNDS", "value": "10"}
        ],
        "plan": "free",
        "buildCommand": "npm install",
        "startCommand": "npm start"
    }
})

print(f"Create response code: {code}")
print(f"Response: {json.dumps(new_service, indent=2)}")

if code in [200, 201]:
    print(f"\n=== Service Created! ===")
    print(f"Service ID: {new_service.get('id')}")
    print(f"Service Name: {new_service.get('name')}")
else:
    print(f"\nError: {new_service}")

print("\n=== Done ===")
