import subprocess
import json
import time
import os
import tempfile

# Use temp file for payload
temp_dir = tempfile.gettempdir()
payload_file = os.path.join(temp_dir, 'render_payload.json')

payload = json.dumps({
    "name": "petpaw",
    "type": "web_service",
    "ownerId": "tea-d74nfluuk2gs73a8kltg",
    "region": "oregon",
    "repo": "https://github.com/gta771771-ctrl/pet365-store",
    "branch": "main",
    "autoDeploy": True,
    "plan": "free",
    "serviceDetails": {
        "buildCommand": "npm install",
        "startCommand": "npm start",
        "healthCheckPath": "/"
    }
})

with open(payload_file, 'w') as f:
    f.write(payload)

print(f"Payload file: {payload_file}")

print("\n=== Creating service with curl ===")
result = subprocess.run([
    'curl', '-s', '-X', 'POST',
    'https://api.render.com/v1/services',
    '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV',
    '-H', 'Content-Type: application/json',
    '-d', f'@{payload_file}'
], capture_output=True, text=True, timeout=30)

print(f"Exit: {result.returncode}")
print(f"Stdout: {result.stdout[:3000]}")
print(f"Stderr: {result.stderr[:500]}")

# Parse response
try:
    resp = json.loads(result.stdout)
    if 'id' in resp:
        service_id = resp['id']
        print(f"\n=== SUCCESS! Service ID: {service_id} ===")
        print(f"Waiting for deployment...")
        
        # Poll for deployment status
        for i in range(20):
            time.sleep(30)
            status = subprocess.run([
                'curl', '-s', '-X', 'GET',
                f'https://api.render.com/v1/services/{service_id}',
                '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV'
            ], capture_output=True, text=True, timeout=30)
            
            try:
                status_data = json.loads(status.stdout)
                deploy = status_data.get('latestDeploy', {})
                deploy_status = deploy.get('status', 'unknown')
                print(f"  Check {i+1}: {deploy_status}")
                if deploy_status == 'live':
                    print(f"\n=== DEPLOYED! ===")
                    print(f"URL: https://petpaw.onrender.com")
                    break
            except:
                print(f"  Check {i+1}: Error parsing status")
    else:
        print(f"No service ID in response: {resp}")
except:
    print(f"Could not parse response")

os.remove(payload_file)
