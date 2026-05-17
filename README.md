# Vehicle Image Processing Pipeline

An enterprise-ready, high-performance asynchronous image processing pipeline designed for vehicle validation and duplicate detection. The system accepts vehicle image uploads, queues them for processing, executes six robust quality checks (four in parallel and two sequentially), and stores rich analysis results in a relational database, exposing real-time monitoring and paging APIs.

---

## 2. Architecture Diagram

```
Client
  │
  ▼
POST /api/upload
  │
  ▼
Express API ──► Multer (file save) ──► PostgreSQL (Job row: pending)
  │
  ▼
BullMQ Queue (Redis)
  │
  ▼
BullMQ Worker
  │
  ├── blurDetection      (Sharp)
  ├── brightnessCheck    (Sharp)
  ├── dimensionCheck     (Sharp)
  ├── screenshotDetection(Sharp + exifr)
  ├── numberPlateOCR     (Tesseract.js)
  └── duplicateDetection (crypto SHA-256 + DB)
  │
  ▼
PostgreSQL (JobResult row: completed/failed)
  │
  ▼
GET /api/jobs/:id/result
```

---

## 3. Service Flow

1. **Client Request**: Client sends a `POST /api/upload` request attaching an image file.
2. **Multer Validation**: Custom Multer middleware validates the file extension and checks that the size does not exceed `MAX_FILE_SIZE_MB`.
3. **Storage Persistence**: The upload is written to local disk under a unique, timestamped filename format: `<cuid>-<timestamp>.<ext>`.
4. **Database Registration**: A new record is registered in the PostgreSQL `Job` table with status `pending`.
5. **Asynchronous Enqueuing**: The `jobId` is enqueued into the BullMQ (Redis-backed) queue. The Express API instantly returns the `jobId` and a `201 Created` response.
6. **Worker Processing**: A BullMQ Worker picks up the job from Redis and transitions the database Job status to `processing`.
7. **Pipeline Quality Checks**: Six image checks are executed in a hybrid parallel/sequential workflow:
   - **Parallel**: Blur Detection, Brightness Check, Dimension Check, and Screenshot Detection run concurrently.
   - **Sequential**: OCR (Tesseract.js) and Duplicate Detection run sequentially.
8. **Results Serialization**: The aggregate scores are analyzed. If they pass the threshold (overall confidence >= 60% with zero critical failures), `overallPassed` is set to `true`. Results are saved to the `JobResult` table and the Job status transitions to `completed`.
9. **Graceful Failure & Retries**: On any critical processing error:
   - If the image is corrupt/unreadable (`statusCode 422`), it fails fast, marking the Job status as `failed` with `failureReason` set to `"Unreadable image file"` immediately.
   - Otherwise, the worker retries up to 3 times with exponential backoff before transitioning to `failed` and logging the failure.
10. **Result Querying**: Client polls `GET /api/jobs/:id/status` until completion, then queries `GET /api/jobs/:id/result` to fetch analysis reports.

---

## 4. Design Decisions

- **Why BullMQ over SQS/RabbitMQ**: Redis is already a mandatory dependency for high-performance rate limiting. Integrating BullMQ allows us to reuse the existing Redis container without introducing an external message broker like RabbitMQ or SQS. It provides automatic retries, exponential backoff, and robust concurrency controls out of the box, as well as an in-memory queue fallback for Redis-free developer environments.
- **Why local Sharp over AWS Rekognition**: Running `sharp` locally provides a massive cost saving of $0 per image processed. It completely bypasses external network latency, runs deterministic pixel analysis, and allows the entire test suite and application environment to run completely offline without relying on cloud credentials or internet connectivity.
- **Why in-memory fallback queue**: To make the system runnable with zero configuration, the codebase automatically detects if Redis is unavailable during bootstrap and falls back to a highly reliable asynchronous in-memory queue that mimics the BullMQ retry and delay pattern. This enables instant local evaluation, while we clearly log warning flags that this is not production-safe.
- **Why Prisma over raw SQL**: Prisma provides a fully type-safe query client, structured database migrations, and a clean declarative schema file. This prevents structural query bugs, automates table setups, and ensures clean relational mapping between the `Job` and `JobResult` tables.
- **Weighted confidence scoring**: Each of the 6 checks contributes a different weight based on its importance in real-world vehicle verification. For instance, **Blur Detection** and **Number Plate OCR** are weighted highest because unreadable plates or blurry pictures directly compromise vehicle data indexing quality.

---

## 5. Prerequisites

- Node.js >= 20
- PostgreSQL >= 14
- Redis >= 7
- Docker & Docker Compose (optional but recommended)

---

## 6. Running Locally (Manual)

Follow these step-by-step instructions to boot the system:

```bash
# 1. Clone and install
git clone <repo-url>
cd <repo>
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL and Redis connection strings

# 3. Set up database
npx prisma migrate deploy
npx prisma generate

# 4. (Optional) Seed sample data
npm run seed

# 5. Start development server
npm run dev

# API is now running at http://localhost:3000
```

---

## 7. Running with Docker (Recommended)

Get the entire production-grade stack running in one command:

```bash
# 1. Copy env file
cp .env.example .env

# 2. Build and start all services
# (postgres, redis, api, worker — all in one command)
docker compose up --build

# 3. In a new terminal, seed the database
docker compose exec api npm run seed

# 4. Verify everything is healthy
curl http://localhost:3000/api/health

# Expected response:
# { "success": true, "data": { "status": "ok", "db": "connected", "redis": "connected" } }

# 5. To stop
docker compose down

# To stop and wipe all data volumes
docker compose down -v
```

---

## 8. Running Tests

We maintain an extremely stable test harness with high test coverage:

```bash
# Unit tests only (no DB or Redis needed)
npm run test:unit

# Integration tests (needs TEST_DATABASE_URL + Redis)
npm run test:integration

# E2E tests (needs full stack)
npm run test:e2e

# Full suite with coverage report
npm run test:coverage

# Watch mode during development
npm run test:watch
```

> [!NOTE]
> Unit tests are fully mocked and run without any infrastructure. Integration and E2E tests require a running PostgreSQL instance at `TEST_DATABASE_URL` and Redis.

---

## 9. API Reference

### `POST /api/upload`
Uploads a vehicle image and enqueues a processing job.

#### Curl Example
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "image=@/path/to/vehicle.jpg"
```

#### Response (201 Created)
```json
{
  "success": true,
  "data": {
    "jobId": "cmp9b0lt8000011c0cizqtpu0",
    "status": "pending",
    "filename": "cmp9b0lt8-1778993868119.jpg",
    "fileSize": 204800,
    "uploadedAt": "2026-05-17T10:27:48.064Z"
  }
}
```

---

### `GET /api/jobs/:id/status`
Checks the processing status of a job.

#### Curl Example
```bash
curl http://localhost:3000/api/jobs/cmp9b0lt8000011c0cizqtpu0/status
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "jobId": "cmp9b0lt8000011c0cizqtpu0",
    "status": "completed",
    "createdAt": "2026-05-17T10:27:48.064Z",
    "updatedAt": "2026-05-17T10:27:48.824Z"
  }
}
```

---

### `GET /api/jobs/:id/result`
Retrieves detailed analysis results for a completed job.

#### Curl Example
```bash
curl http://localhost:3000/api/jobs/cmp9b0lt8000011c0cizqtpu0/result
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "jobId": "cmp9b0lt8000011c0cizqtpu0",
    "overallPassed": true,
    "overallConfidence": 0.79,
    "isDuplicate": false,
    "duplicateOfJobId": null,
    "processedAt": "2026-05-17T10:27:48.824Z",
    "issuesSummary": [],
    "criticalFailures": [],
    "checks": [
      { "check": "blurDetection", "passed": true, "confidence": 1.0, "detail": "Laplacian variance: 243.1 (threshold: 80)", "value": 243.1 },
      { "check": "brightnessCheck", "passed": true, "confidence": 1.0, "detail": "Brightness: 128.4 — within range", "value": 128.4 },
      { "check": "dimensionCheck", "passed": true, "confidence": 0.6, "detail": "400x400 — above minimum (300px)", "value": "400x400" },
      { "check": "screenshotDetection", "passed": true, "confidence": 1.0, "detail": "No screenshot indicators detected", "value": null },
      { "check": "numberPlateOCR", "passed": false, "confidence": 0.4, "detail": "Extracted: 'ABCD123' — invalid format", "value": "ABCD123" },
      { "check": "duplicateDetection", "passed": true, "confidence": 1.0, "detail": "No duplicate found", "value": null }
    ]
  }
}
```

---

### `GET /api/jobs/:id/failure`
Retrieves the failure context for a failed job.

#### Curl Example
```bash
curl http://localhost:3000/api/jobs/cmp9b0lt8000011c0cizqtpu0/failure
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "jobId": "cmp9b0lt8000011c0cizqtpu0",
    "status": "failed",
    "failureReason": "Unreadable image file",
    "failedAt": "2026-05-17T10:27:48.824Z",
    "attempts": 3
  }
}
```

---

### `GET /api/jobs`
List all jobs with pagination and filter criteria.

#### Curl Example
```bash
curl "http://localhost:3000/api/jobs?status=completed&limit=10&offset=0"
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "cmp9b0lt8000011c0cizqtpu0",
        "status": "completed",
        "createdAt": "2026-05-17T10:27:48.064Z",
        "updatedAt": "2026-05-17T10:27:48.824Z"
      }
    ],
    "total": 42,
    "limit": 10,
    "offset": 0,
    "hasMore": true,
    "nextOffset": 10
  }
}
```

---

### `GET /api/health`
Checks backend services status.

#### Curl Example
```bash
curl http://localhost:3000/api/health
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "db": "connected",
    "redis": "connected",
    "queue": "bullmq",
    "queueDepth": 0,
    "uptime": 142.3,
    "timestamp": "2026-05-17T10:27:48.064Z"
  }
}
```

---

## 10. Error Responses

All failed API requests return a structured JSON error envelope:

```json
{
  "success": false,
  "error": "Job not found"
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 400 | Bad Request | Missing file, zero-byte file, invalid sorting parameters |
| 404 | Not Found | Job ID does not exist in the database |
| 413 | Payload Too Large | Uploaded file size exceeds `MAX_FILE_SIZE_MB` |
| 415 | Unsupported Media Type | Non-image or corrupted MIME type uploaded |
| 422 | Unprocessable Entity | Image is corrupt or fundamentally unreadable |
| 429 | Too Many Requests | Upload rate limit is exceeded for the IP address |
| 503 | Service Unavailable | Database or underlying service is completely unreachable |

---

## 11. Image Analysis Checks

| Check | Method | Pass Condition | Confidence Basis |
|-------|--------|----------------|-----------------|
| **Blur Detection** | Laplacian variance calculated on grayscale raw pixel buffer | Variance >= `BLUR_THRESHOLD` (80) | variance / 200 clamped between 0 and 1 |
| **Brightness** | Perceived luminance algorithm: `0.299R + 0.587G + 0.114B` | `40 <= brightness <= 220` | Linear interpolation scaled from target range boundaries |
| **Dimension** | Sharp metadata extraction of width and height | Both width and height >= `MIN_IMAGE_DIMENSION` (300px) | `0.0` (fail), `0.6` (threshold), `1.0` (above threshold) stepped |
| **Screenshot** | Border uniformity sampling + EXIF software checks | Heuristic score threshold < 2 | Inverted count of detected screenshot properties |
| **Number Plate OCR** | Tesseract.js single-line PSM7 cropped plate zone + Regex | Matches Standard Indian plate formats | Matches: `0.95`, Plate present: `0.4`, No plate: `0.1` |
| **Duplicate Detection** | Crypto SHA-256 byte hash compared against database | No previous completed jobs match the image hash | Binary: `1.0` (Unique) or `0.0` (Duplicate) |

---

## 12. AI Usage Disclosure

This project was built with professional AI assistance (Google Gemini/Claude/ChatGPT). Here is an honest breakdown of the collaboration:

### Where AI was used
- **Boilerplate Structure**: Generation of the initial Express middleware configurations, Prisma migration schema setup, and standard `tsconfig.json`.
- **Mathematical Implementations**: Designing the foundation algorithms for Laplacian kernel calculations and brightness scoring.
- **Tesseract and Sharp Interfaces**: Crafting the structure for invoking native modules inside node processes.
- **Docker Compose Structure**: Creating the baseline Docker configurations for PostgreSQL and Redis services.

### What AI got wrong & needed correction
- **Blur detection**: The AI initially generated an incorrect Laplacian 2D convolution kernel that didn't scale correctly with raw sharp buffers, which would have returned false blur detections. Manually corrected to use standard Sharp statistical variance mapping.
- **Tesseract Worker Management**: AI suggested a synchronous loading structure that crashed in production with Tesseract.js v4+. Corrected this by implementing a persistent, lazy-loaded singleton worker pattern.
- **BullMQ Syntaxes**: AI generated deprecated parameters and configuration schemas from BullMQ v1, which had to be manually migrated to BullMQ v3 API.
- **Screenshot Border Heuristics**: AI incorrectly targeted absolute coordinates for border sampling, risking out-of-bounds array crashes. Rewrote the Sharp buffer slicing to properly sample dynamic coordinates.

### How AI output was validated
- A highly thorough, 61-test unit/integration/E2E test suite was maintained and run locally to verify every edge case, including zero-byte uploads, corrupted file aborts, and concurrent processing.
- Strictly ran TypeScript typechecks in strict mode, catching multiple typings mistakes and dynamic import issues inside Jest.

### Where AI was NOT used
- **Teardown Leak Resolution**: Resolving the Jest open connection handles was done entirely manually by reasoning through the worker/queue connections and implementing sequential, idempotent teardowns.
- **Threshold Fine-tuning**: Empirically deciding thresholds (e.g. 80 for Laplacian blur and 40-220 for brightness range) by feeding actual images and synthetic test fixtures into the pipeline.

---

## 13. Trade-offs and Simplifications

### Intentionally simplified
- **OCR Accuracy**: Number plate recognition relies on simple center crops and Tesseract.js. An enterprise production system would deploy a dedicated model such as YOLO or OpenALPR.
- **Screenshot Detection**: Relies on basic EXIF headers and border uniformity. Visual anomalies or cropped screenshot overlays would require a convolutional neural network.
- **Local File Storage**: Files are saved directly to local storage disks. In a distributed cloud environment, this should be replaced with shared Object Storage (AWS S3, Google Cloud Storage) using presigned URLs.
- **Security**: No authentication layers are implemented. Production platforms require OAuth/JWT or cryptographically secure API keys.

### Future Improvements
- **Webhooks**: Adding push webhooks to notify external API consumers as soon as job results transition to `completed`/`failed`.
- **Perceptual Deduplication**: Expanding deduplication checks with perceptual hashing (pHash) to identify cropped, compressed, or resized variants of the same vehicle image.
- **Horizontal Scaling**: Orchestrating multiple separate worker nodes to scale container concurrency under a central Redis broker.

---

## 14. Assumptions

- **Indian Vehicles**: The system assumes license plates follow standardized Indian registration patterns (e.g., `MH12AB1234`).
- **Exact Byte Duplicates**: Duplicate detection uses strict SHA-256 byte hashing, mapping identical files only.
- **IP Rate Limiting**: The rate-limiting middleware operates per client IP, assuming target clients are individual nodes.
