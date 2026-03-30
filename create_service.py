import urllib.request
import json
import ssl

RENDER_API_KEY = "rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV"
OWNER_ID = "tea-d74nfluuk2gs73a8kltg"

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

print("=== Creating Web Service on Render ===")
print(f"Owner ID: {OWNER_ID}")
print()

# Create the web service
create_data = {
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
        {"key": "RENDER", "value": "true"},
        {"key": "BCRYPT_ROUNDS", "value": "10"},
        {"key": "PORT", "value": "10000"}
    ]
}

result, code = render_api("https://api.render.com/v1/services", "POST", create_data)
print(f"Response code: {code}")
print(f"Response: {json.dumps(result, indent=2)[:2000]}")

if code in [200, 201]:
    service_id = result.get("id")
    service_name = result.get("name")
    print(f"\n=== SUCCESS! ===")
    print(f"Service ID: {service_id}")
    print(f"Service Name: {service_name}")
    print(f"\nWaiting for deployment...")
    
    # Wait and check status
    import time
    for i in range(10):
        time.sleep(15)
        status, code = render_api(f"https://api.render.com/v1/services/{service_id}")
        if code == 200:
            deploy_status = status.get("latestDeploy", {}).get("status", "unknown")
            print(f"  Deploy status [{i+1}]: {deploy_status}")
            if deploy_status == "live":
                print(f"\n=== DEPLOYED! ===")
                print(f"URL: https://petpaw.onrender.com")
                break
        else:
            print(f"  Status check error: {code}")
else:
    print(f"\nError: {result}")

print("\n=== Done ===")
