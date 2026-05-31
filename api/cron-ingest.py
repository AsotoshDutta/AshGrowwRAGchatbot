import os
import urllib.request
import json
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/cron-ingest', methods=['GET', 'POST'])
@app.route('/', methods=['GET', 'POST'])
def cron_ingest():
    auth_header = request.headers.get('Authorization', '')
    cron_secret = os.environ.get('CRON_SECRET')

    # Validate Authorization header if CRON_SECRET is configured
    if cron_secret and auth_header != f"Bearer {cron_secret}":
        return jsonify({"error": "Unauthorized. Invalid Cron Secret."}), 401

    deploy_hook_url = os.environ.get('VERCEL_DEPLOY_HOOK_URL')
    if not deploy_hook_url:
        print("[CRON] VERCEL_DEPLOY_HOOK_URL environment variable is missing.")
        return jsonify({"error": "VERCEL_DEPLOY_HOOK_URL environment variable is not configured."}), 500

    try:
        print("[CRON] Triggering rebuild via Vercel Deploy Hook...")
        req = urllib.request.Request(deploy_hook_url, method='POST')
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            data = json.loads(res_data)
            print(f"[CRON] Deploy Hook triggered successfully. Job ID: {data.get('job', {}).get('id')}")
            return jsonify({
                "success": True,
                "message": "Daily rebuild and ingest pipeline triggered successfully.",
                "jobId": data.get('job', {}).get('id')
            }), 200
    except Exception as e:
        print(f"[CRON] Error triggering Deploy Hook: {e}")
        return jsonify({
            "error": "Failed to trigger Vercel Deploy Hook rebuild.",
            "details": str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=3000)
