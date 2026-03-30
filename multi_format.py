import subprocess
import json
import time
import os
import tempfile

temp_dir = tempfile.gettempdir()
payload_file = os.path.join(temp_dir, 'render_payload.json')

# Try different payload formats
formats = [
    # Format 1: Simple
    {
        "name": "petpaw",
        "type": "web_service",
        "ownerId": "tea-d74nfluuk2gs73a8kltg",
        "region": "oregon",
        "repo": "https://github.com/gta771771-ctrl/pet365-store",
        "branch": "main",
        "plan": "free",
        "serviceDetails": {
            "buildCommand": "npm install",
            "startCommand": "npm start",
            "healthCheckPath": "/"
        }
    },
    # Format 2: Without ownerId in serviceDetails
    # Format 3: With explicit env vars in serviceDetails
]

for i, payload in enumerate(formats):
    with open(payload_file, 'w') as f:
        json.dump(payload, f)
    
    print(f"\n=== Try {i+1} ===")
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        'https://api.render.com/v1/services',
        '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV',
        '-H', 'Content-Type: application/json',
        '-d', f'@{payload_file}'
    ], capture_output=True, text=True, timeout=30)
    
    print(f"Stdout: {result.stdout[:500]}")
    
    try:
        resp = json.loads(result.stdout)
        if 'id' in resp:
            print(f"SUCCESS! Service ID: {resp['id']}")
            service_id = resp['id']
            
            # Poll for deployment
            for j in range(15):
                time.sleep(30)
                status_result = subprocess.run([
                    'curl', '-s', '-X', 'GET',
                    f'https://api.render.com/v1/services/{service_id}',
                    '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV'
                ], capture_output=True, text=True, timeout=30)
                
                try:
                    s = json.loads(status_result.stdout)
                    ds = s.get('latestDeploy', {}).get('status', 'unknown')
                    print(f"  Deploy {j+1}: {ds}")
                    if ds == 'live':
                        print(f"DEPLOYED! URL: https://petpaw.onrender.com")
                        exit(0)
                except:
                    print(f"  Deploy {j+1}: parse error")
            
            break
    except:
        pass

# Also try creating via GitHub app installation
print("\n=== Try Blueprints (GitHub App) ===")
blueprint_payload = {
    "githubRepo": "gta771771-ctrl/pet365-store",
    "githubBranch": "main",
    "ownerId": "tea-d74nfluuk2gs73a8kltg",
    "name": "petpaw",
    "plan": "free"
}

with open(payload_file, 'w') as f:
    json.dump(blueprint_payload, f)

result = subprocess.run([
    'curl', '-s', '-X', 'POST',
    'https://api.render.com/v1/blueprints',
    '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV',
    '-H', 'Content-Type: application/json',
    '-d', f'@{payload_file}'
], capture_output=True, text=True, timeout=30)

print(f"Blueprint stdout: {result.stdout[:1000]}")

os.remove(payload_file)
