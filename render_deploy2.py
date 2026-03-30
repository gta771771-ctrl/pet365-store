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

print("=== Getting Account Info ===")
account, code = render_api("https://api.render.com/v1/account")
print(f"Code: {code}")
if code == 200:
    print(f"Account ID: {account.get('id')}")
    print(f"Name: {account.get('name')}")
    owner_id = account.get('id')
else:
    print(f"Error: {account}")
    owner_id = None

if not owner_id:
    # Try user endpoint
    user, code = render_api("https://api.render.com/v1/user")
    print(f"User code: {code}")
    if code == 200:
        print(f"User: {json.dumps(user, indent=2)}")
        owner_id = user.get('id') or user.get('user', {}).get('id')

print(f"\nOwner ID: {owner_id}")

print("\n=== Creating Web Service ===")
if owner_id:
    new_service, code = render_api("https://api.render.com/v1/services", "POST", {
        "service": {
            "name": "petpaw",
            "region": "oregon",
            "serviceType": "web",
            "ownerId": owner_id,
            "source": {
                "type": "github",
                "repo": "gta771771-ctrl/pet365-store",
                "branch": "main",
                "autoDeploy": True
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
    print(f"Create code: {code}")
    print(f"Response: {json.dumps(new_service, indent=2)[:2000]}")

print("\n=== Done ===")
