# Deploying to Render.com (Free Tier)

This guide documents the architecture layout, environment configurations, known limitations, and step-by-step setup instructions for hosting this high-performance image processing pipeline on the Render.com free tier.

---

## 1. Free Tier Limitations

Host services on Render's free tier operate under specific infrastructure constraints. Review these limitations and workarounds before deploying:

| Limitation | Impact | Workaround / Production Path |
|---|---|---|
| **API Idle Spin-Down** | The API service spins down after 15 minutes of zero traffic. The first request after an idle period takes ~30 seconds (cold start). | Acceptable for portfolio/evaluation. Upgrade to a paid instance (Web Service Starter, $7/mo) to keep it warm. |
| **PostgreSQL Expiration** | The Render free tier PostgreSQL database expires and is deleted exactly **90 days** after creation. | Suitable only for testing. Upgrade to a paid plan ($7/mo) or connect to an external managed database (e.g., Neon, Supabase, or AWS RDS). |
| **Ephemeral Filesystem** | Render containers do not have persistent disks. Files written to local disk (e.g., uploaded images) are wiped on redeploys, manual restarts, or daily container recycling. | In production, use **AWS S3** or **Google Cloud Storage** for persistent file storage via signed upload URLs. |
| **No Native Free Redis** | Render does not offer a free tier for native Redis services. | We integrate **Upstash Redis (Free Tier)** instead, which provides a fully compatible cloud Redis instance with SSL/TLS required out of the box. |
| **512MB Memory Limit** | Render's free tier allows 512MB RAM per container. Because Sharp and Tesseract.js are resource-heavy, large images (>5MB) may trigger Out-Of-Memory (OOM) failures. | We pre-bundle the Tesseract `eng.traineddata` files during Docker build to minimize runtime memory spikes. In production, upgrade worker RAM to 1GB+. |

---

## 2. Upstash Redis Setup Instructions

BullMQ requires a high-performance Redis connection. Follow these steps to obtain a free Cloud Redis instance:

1. **Sign Up**: Go to [https://upstash.com](https://upstash.com) and sign up for a free account.
2. **Create Database**:
   - In the Upstash console, click **Create Database**.
   - **Name**: `vehicle-pipeline-redis`
   - **Region**: Pick the region closest to your Render server deployment (e.g., Oregon `us-west-2` if your Render region is Oregon / US West).
   - **Type**: Regional (Free tier).
   - Click **Create**.
3. **Copy Connection String**:
   - Scroll down to the **Node.js** or **Redis Client** connection section.
   - Look for the **`REDIS_URL`** connection string (which uses SSL).
   - It will look like: `rediss://default:xxxxxxxxxxxx@xxxx-xxxx-xxxxx.upstash.io:6379`.
   - **Copy this URL** for the next steps (keep it private!).

---

## 3. Step-by-Step Render Deployment Guide

Follow these sequential steps to boot the entire stack:

### Step 1 — Push Code to GitHub
Ensure all Render configurations and corrected scripts are pushed to your repository:
```bash
git add render.yaml scripts/start.sh scripts/smoke-test.sh Dockerfile package.json README.md
git commit -m "feat: add production-ready Render deployment config"
git push
```

### Step 2 — Sign In to Render
Go to [https://render.com](https://render.com) and sign up/log in using your GitHub account.

### Step 3 — Deploy via Blueprint
1. Click the **New** button in the upper-right corner of the Render Dashboard.
2. Select **Blueprint** from the drop-down menu.
3. Connect your public GitHub repository (`ararajitaks/backend-project` or your fork).
4. Render automatically parses the `render.yaml` file.
5. Click **Apply**. This creates three services in parallel:
   - `vehicle-pipeline-api` (Web Service)
   - `vehicle-pipeline-worker` (Background Worker)
   - `vehicle-pipeline-db` (PostgreSQL Database)

### Step 4 — Add Upstash Redis Connection URL
Because the database connection string is auto-injected by Render, you only need to manually paste the Redis URL:
1. Go to the Render Dashboard and click on **`vehicle-pipeline-api`**.
2. Click **Environment** in the sidebar.
3. Under Environment Variables, find `REDIS_URL` and paste your copied Upstash connection string as its value.
4. Click **Save Changes**.
5. Do the same for **`vehicle-pipeline-worker`** (paste the exact same Upstash `REDIS_URL` under Environment).

### Step 5 — Manual Redeployment
Once the environment variables are saved, trigger a final deploy to ensure both services spin up with the correct Redis configuration:
1. Go to `vehicle-pipeline-api` → Click **Manual Deploy** → Select **Deploy latest commit**.
2. Go to `vehicle-pipeline-worker` → Click **Manual Deploy** → Select **Deploy latest commit**.

### Step 6 — Verify Deployment
To confirm that both Postgres and Redis are fully connected, run a health check:
```bash
# Replace with your actual Render API service URL
curl https://vehicle-pipeline-api.onrender.com/api/health
```
**Expected Health Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "db": "connected",
    "redis": "connected",
    "queue": "bullmq",
    "queueDepth": 0
  }
}
```

### Step 7 — Run Seed Data (Optional)
If you want to pre-populate the database with sample jobs:
1. Go to the **`vehicle-pipeline-api`** details page on the Render dashboard.
2. Click the **Shell** tab in the sidebar.
3. Run the following CLI seed command directly:
   ```bash
   npm run seed
   ```

---

## 4. Environment Variables Reference

These environment variables are declared in `render.yaml` or must be provided:

| Variable Name | Required | Default Value | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Set to `production` to optimize compilation, logging, and performance. |
| `PORT` | Yes | `10000` | Port for the Express server inside the container. Render maps this port to standard HTTP. |
| `DATABASE_URL` | Yes | *Auto-injected* | PostgreSQL connection string. Handled automatically via Render blueprint databases linkage. |
| `REDIS_URL` | Yes | *Manual Paste* | Upstash Redis connection string. **Must start with `rediss://`** to enforce SSL/TLS encryption. |
| `UPLOAD_DIR` | Yes | `/tmp/uploads` | Local writing path. Render requires this to be `/tmp/uploads` for writable permissions. |
| `MAX_FILE_SIZE_MB` | No | `10` | Maximum image size limit in Megabytes. |
| `BLUR_THRESHOLD` | No | `80` | Laplacian variance threshold. Lower scores identify blurry images. |
| `MIN_IMAGE_DIMENSION` | No | `300` | Minimum image dimension in pixels (width and height). |
| `OCR_TIMEOUT_MS` | No | `10000` | Tesseract.js timeout threshold in milliseconds to prevent long-running tasks. |

---

## 5. Troubleshooting & FAQ

### 1. Build fails during Docker steps
* **Symptom**: The container build fails with file not found or prisma errors.
* **Resolution**: Verify your local files have correct paths. Make sure you don't copy local `.env` or `node_modules` in the Docker context. The Docker build generates files from scratch in two clean stages.

### 2. Database connection fails
* **Symptom**: API logs show `PrismaClientInitializationError: Can't reach database server`.
* **Resolution**: Ensure the database is healthy. When using Blueprint, the database connection string is mapped to `DATABASE_URL` automatically via `fromDatabase`. Ensure you have not overridden this manually in a custom environment configuration.

### 3. Redis connection crashes on start
* **Symptom**: Logs show `ECONNREFUSED` or authentication errors connecting to Redis.
* **Resolution**: Ensure you are using the Upstash URL. Verify the protocol starts with **`rediss://`** (note the double **`s`**), which is required for SSL connections to Upstash.

### 4. Background worker not processing jobs
* **Symptom**: Image uploads succeed and return a `jobId` in status `pending`, but the job never transitions to `processing`.
* **Resolution**: Check the logs of the `vehicle-pipeline-worker` background service. Make sure it is active, successfully running, and has the exact same `REDIS_URL` environment variable as the API.

### 5. Out Of Memory (OOM) crashes in Worker
* **Symptom**: Worker crashes with exit code `137` when processing an image.
* **Resolution**: Render free tier is limited to 512MB RAM. Image cropping, resizing, and OCR (Tesseract) can consume significant memory. Avoid uploading images larger than 5MB, or upgrade the Render worker instance to the Starter tier (1GB+ RAM).
