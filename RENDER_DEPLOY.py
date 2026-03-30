import urllib.request
import urllib.parse
import urllib.error
import json

# Render API - need to get the API key from the user's Render dashboard
# The user needs to create a Render API key at: https://dashboard.render.com/api-keys

# For now, let's try to use Render Blueprint API
# We can deploy via GitHub integration

RENDER_API_KEY = None  # User needs to provide this

def render_api_request(url, method="GET", data=None, api_key=None):
    if not api_key:
        return {"error": "No API key provided"}, 401
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, method=method, headers=headers)
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode()), e.code

print("""
=== Render Deployment Instructions ===

Since we cannot access the browser directly, please follow these steps:

STEP 1: Open Render Dashboard
   Go to: https://dashboard.render.com

STEP 2: Connect GitHub
   - Click "New +" → "Blueprint"
   - Authorize GitHub if not already connected
   - Select the "pet365-store" repository

STEP 3: Configure the Blueprint
   - Name: petpaw
   - Region: Oregon (or closest to you)
   - Branch: main
   - Plan: Free
   - The render.yaml will auto-configure everything

STEP 4: Click "Apply"

STEP 5: Wait for deployment (3-5 minutes)

STEP 6: Get the URL (e.g., https://petpaw.onrender.com)

STEP 7: Configure DNS on Namecheap (see below)

=== Namecheap DNS Setup ===

After getting the Render URL, go to Namecheap:
1. Sign in at: https://www.namecheap.com
2. Go to Dashboard → Domain List → pet365.store → Manage
3. Click "Advanced DNS"
4. Add these records:

   Type: CNAME Record
   Host: @
   Value: YOUR_RENDER_URL (e.g., petpaw.onrender.com)
   TTL: Automatic

   Type: CNAME Record  
   Host: www
   Value: YOUR_RENDER_URL (e.g., petpaw.onrender.com)
   TTL: Automatic

5. Save and wait 24-48 hours for DNS propagation

=== Admin Access After Deployment ===
- Admin URL: https://pet365.store/admin
- Username: admin
- Password: 123456
""")

# Check if we can deploy via API instead
print("\n\nTrying to deploy via Render API...")
print("To get a Render API key, go to: https://dashboard.render.com/api-keys")
