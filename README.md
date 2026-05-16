# Image Processing Pipeline

A robust, asynchronous Node.js backend for validating and analyzing vehicle images.

## Architecture

```text
       [ Client ]
           |
     (HTTP POST /api/upload)
           v
   +---------------+      (Saves File)      +-------------------+
   |  API Server   | ---------------------> | Local File System |
   +---------------+                        +-------------------+
           | (Enqueues Job)                          ^
           v                                         | (Reads File)
    +-------------+                                  |
    | BullMQ (Redis)|                                |
    +-------------+                                  |
           | (Pops Job)                              |
           v                                         |
   +---------------+                                 |
   | Async Worker  | --------------------------------+
   +---------------+
           | (Writes Status/Results)
           v
    +-------------+
    | PostgreSQL  |
    +-------------+
```

## Service Flow

1. **Upload**: Client sends a `multipart/form-data` request with an image to `POST /api/upload`.
2. **Validation**: Multer and Zod validate the MIME type, file size, and file existence. A zero-byte check is performed, and the file is stored.
3. **Database Stub**: A `Job` row is created in PostgreSQL with `status = "pending"`.
4. **Queueing**: The `jobId` is enqueued via BullMQ (or an in-memory queue if Redis is absent).
5. **Immediate Response**: The API returns a `201 Created` with the pending `jobId` so the client can begin polling.
6. **Processing**: The Worker picks up the job, marks it `"processing"`, reads the file, and runs a battery of `sharp` and Tesseract OCR heuristics (blur, brightness, dimension, screenshot detection, duplicate hashing, and number plate parsing).
7. **Completion**: The Worker aggregates the confidence scores, writes a `JobResult` payload to PostgreSQL, and updates the Job status to `"completed"` (or `"failed"`).
8. **Retrieval**: The Client polls `GET /api/jobs/:id/result` and ultimately receives the full analysis payload.

## Design Decisions

- **BullMQ + Redis**: Selected for industry-standard job queuing. BullMQ natively handles exponential backoff, retry constraints, and concurrent worker scaling without blocking the Node event loop.
- **In-Memory Fallback**: For frictionless local testing and resilience against temporary infrastructure outages, an `EventEmitter`-based fallback queue dynamically takes over if the Redis connection times out during bootstrap.
- **Prisma ORM**: Offers unparalleled type safety across the database layer, allowing seamless integration between the database schema (`schema.prisma`) and TypeScript interfaces.
- **Tesseract Singleton**: Tesseract's `createWorker` is an expensive operation. By initializing it lazily but persistently at the module level, we prevent immense memory/CPU overhead compared to spinning up a worker per job.

## Running Locally (Manual)

### Prerequisites
- Node.js >= 20.x
- PostgreSQL database
- (Optional but recommended) Redis

### Setup Steps
1. **Environment**: Copy `.env.example` to `.env` and fill in the connection strings.
   ```bash
   cp .env.example .env
   ```
2. **Install Dependencies**:
   ```bash
   npm ci
   ```
3. **Migrate Database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```
4. **Seed Database** (Optional):
   ```bash
   npm run seed
   ```
5. **Start the API Server**:
   ```bash
   npm run dev
   ```
6. **Start the Worker** (In a separate terminal):
   ```bash
   npm run worker:dev
   ```

## Running with Docker

### Setup Steps
1. Ensure Docker and Docker Compose are installed.
2. Build and start the stack:
   ```bash
   docker compose up --build
   ```
3. The API will be available at `http://localhost:3000`.

### Seeding inside the container
```bash
docker compose exec api npm run seed
```

## All API Endpoints

### 1. Upload Image
- **Method**: `POST`
- **Path**: `/api/upload`
- **Description**: Uploads an image, validates it, and queues it for asynchronous processing.
- **Example cURL**:
  ```bash
  curl -X POST http://localhost:3000/api/upload \
    -F "image=@/path/to/car.jpg"
  ```
- **Example Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": {
      "jobId": "cm00xyz...",
      "status": "pending",
      "filename": "1710000000-car.jpg",
      "fileSize": 102400,
      "uploadedAt": "2026-05-17T10:00:00.000Z"
    }
  }
  ```

### 2. List Jobs
- **Method**: `GET`
- **Path**: `/api/jobs`
- **Description**: Retrieves a paginated list of all jobs with optional filtering.
- **Query Params**: `?status=completed&limit=10&offset=0&sortBy=createdAt&sortOrder=desc`
- **Example cURL**:
  ```bash
  curl http://localhost:3000/api/jobs?limit=5
  ```
- **Example Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "jobs": [{ "id": "cm00xyz...", "status": "completed", "originalFilename": "car.jpg", ... }],
      "total": 1,
      "limit": 5,
      "offset": 0,
      "hasMore": false,
      "nextOffset": null
    },
    "meta": {
      "limit": 5,
      "offset": 0,
      "total": 1,
      "hasMore": false,
      "nextOffset": null
    }
  }
  ```

### 3. Get Job Status
- **Method**: `GET`
- **Path**: `/api/jobs/:id/status`
- **Description**: Lightweight polling endpoint to check if a job is `pending`, `processing`, `completed`, or `failed`.
- **Example cURL**:
  ```bash
  curl http://localhost:3000/api/jobs/cm00xyz.../status
  ```
- **Example Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "jobId": "cm00xyz...",
      "status": "processing",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
  ```

### 4. Get Job Result
- **Method**: `GET`
- **Path**: `/api/jobs/:id/result`
- **Description**: Retrieves the full, detailed analysis breakdown of a completed job. Returns 202 if still processing, or 422 if the job failed.
- **Example cURL**:
  ```bash
  curl http://localhost:3000/api/jobs/cm00xyz.../result
  ```
- **Example Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "jobId": "cm00xyz...",
      "status": "completed",
      "imageHash": "abcdef123...",
      "overallPassed": true,
      "overallConfidence": 0.91,
      "isDuplicate": false,
      "duplicateOfJobId": null,
      "checks": [...],
      "processedAt": "2026-05-17T10:00:05.000Z"
    }
  }
  ```

### 5. Get Job Failure
- **Method**: `GET`
- **Path**: `/api/jobs/:id/failure`
- **Description**: Diagnoses a failed job, showing the explicit reason and the number of retry attempts exhausted.
- **Example cURL**:
  ```bash
  curl http://localhost:3000/api/jobs/cm00xyz.../failure
  ```
- **Example Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "jobId": "cm00xyz...",
      "status": "failed",
      "failureReason": "Unreadable image file: Input buffer contains unsupported image format",
      "failedAt": "2026-05-17T10:00:10.000Z",
      "attempts": 3
    }
  }
  ```

### 6. Health Check
- **Method**: `GET`
- **Path**: `/api/health`
- **Description**: Validates operational status of dependencies (DB, Redis) and outputs current Queue depth.
- **Example cURL**:
  ```bash
  curl http://localhost:3000/api/health
  ```
- **Example Response** (`200 OK`):
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
      "timestamp": "2026-05-17T10:05:00.000Z"
    }
  }
  ```

## AI Usage Disclosure

- **Where AI was used**: Architectural scaffolding (Express middleware setup, Prisma models schema), standard TypeScript type generation, initial logic scaffolding for the OCR routines, generating this documentation and the implementation plan logic.
- **What was validated manually**: Edge-case failure logic (guaranteeing `sharp` failure hooks didn't slip into infinite retry loops), the custom Laplacian variance and pixel uniformity threshold mathematics for image validation, and Docker healthcheck parameters. 
- **Where AI was wrong**: Initially recommended importing the Tesseract worker indiscriminately, which would have triggered massive memory leaks in parallel job execution environments; manually corrected via a singleton approach.

## Trade-offs

- **File System Storage vs. Cloud Storage**: For simplicity and rapid execution, files are persisted directly to the local `/uploads` directory. In a real-world, horizontally scaled environment with multiple Worker pods, this would break unless backed by an NFS or seamlessly swapped for an S3-compatible blob store.
- **OCR Limitations**: The current Tesseract implementation is configured purely for "eng" using single-line extraction against a pre-cropped 60% bounding box. A true production system would integrate a specialized ML pipeline (e.g., YOLO or ALPR-specific models) to ensure geometric accuracy prior to character extraction.
- **Queue Dead Lettering**: While we track retries (`attempts`), we do not implement a dedicated Dead Letter Queue (DLQ). Failed jobs remain in the primary database marked as `failed`, which is acceptable for analytics but lacks the advanced retry-inspection natively provided by heavy queues.
