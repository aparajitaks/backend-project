#!/bin/bash
BASE_URL="${1:-https://vehicle-pipeline-api.onrender.com}"

echo "=== Smoke testing $BASE_URL ==="

# 1. Health check
echo "Testing /api/health..."
curl -sf "$BASE_URL/api/health" | python3 -m json.tool

# 2. Upload a test image (downloads a sample and uploads it)
echo "Uploading test image..."
curl -sf "https://via.placeholder.com/400x400.jpg" -o /tmp/test-vehicle.jpg
UPLOAD=$(curl -sf -X POST "$BASE_URL/api/upload" -F "image=@/tmp/test-vehicle.jpg")
echo $UPLOAD | python3 -m json.tool
JOB_ID=$(echo $UPLOAD | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['jobId'])")

# 3. Poll status until completed or failed (max 60s)
echo "Polling job status..."
for i in $(seq 1 12); do
  sleep 5
  STATUS=$(curl -sf "$BASE_URL/api/jobs/$JOB_ID/status")
  CURRENT=$(echo $STATUS | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")
  echo "Attempt $i: $CURRENT"
  if [ "$CURRENT" = "completed" ] || [ "$CURRENT" = "failed" ]; then
    break
  fi
done

# 4. Fetch result
echo "Fetching result..."
curl -sf "$BASE_URL/api/jobs/$JOB_ID/result" | python3 -m json.tool

echo "=== Smoke test complete ==="
