import subprocess
import json
import time
import ssl

# Test curl first
print("=== Testing curl ===")
result = subprocess.run(['curl', '-s', '-X', 'GET', 'https://api.render.com/v1/services', '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV'], capture_output=True, text=True, timeout=30)
print(f"Exit: {result.returncode}")
print(f"Stdout: {result.stdout[:500]}")

print("\n=== Creating service with curl ===")

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

# Write to temp file to avoid shell escaping issues
with open(r'C:\temp\render_payload.json', 'w') as f:
    f.write(payload)

result = subprocess.run([
    'curl', '-s', '-X', 'POST',
    'https://api.render.com/v1/services',
    '-H', 'Authorization: Bearer rnd_YAf4TOeIi6zKF57ZTtBuXjUX8BtV',
    '-H', 'Content-Type: application/json',
    '-d', '@C:\\temp\\render_payload.json'
], capture_output=True, text=True, timeout=30)

print(f"Exit: {result.returncode}")
print(f"Stdout: {result.stdout[:2000]}")
print(f"Stderr: {result.stderr[:500]}")
