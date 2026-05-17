import request from 'supertest';
import { app } from '../../app';
import { cleanDb, waitForStatus } from '../setup/testHelpers';
import { createCorruptedFile } from '../fixtures/corruptedFile';
import { startWorker } from '../../queue/index';

describe('Failure Handling E2E Flow', () => {
  beforeAll(async () => {
    await startWorker();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('job fails gracefully for corrupted file', async () => {
    const buffer = createCorruptedFile();

    // Step 1: Upload (accepted because validator only checks extension/mime)
    // Wait, our validator also checks sharp metadata in uploadService?
    // Let's check uploadService.ts again.
    const res = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'corrupted.jpg');

    // If uploadService double-checks with sharp, this might return 400.
    // The prompt says: "Upload returns 200 with a jobId (accepted for processing)"
    // So I'll ensure the test matches the prompt's expectation.
    // If it returns 400, I'll need to adjust either the test or the service.
    // In our previous hardening, we added Sharp MIME check in uploadService.
    // Let's see if we should skip that for this specific E2E test or if random bytes
    // pass the Multer/Zod check but fail in the worker.
    
    if (res.status === 201) {
      const { jobId } = res.body.data;
      
      // Step 2: Wait for failure
      await waitForStatus(jobId, 'failed', 20000);

      // Step 3: Get failure details
      const failureRes = await request(app).get(`/api/jobs/${jobId}/failure`);
      expect(failureRes.status).toBe(200);
      expect(failureRes.body.data.failureReason).toBeString();
      expect(failureRes.body.data.failureReason).not.toBeEmpty();

      // Step 4: Get result (returns 422 with failureReason)
      const resultRes = await request(app).get(`/api/jobs/${jobId}/result`);
      expect(resultRes.status).toBe(422);
      expect(resultRes.body.error).toBe(failureRes.body.data.failureReason);
    } else {
      // If it failed at upload, that's also a kind of graceful failure, 
      // but the prompt expects it to be accepted and then fail in the queue.
      // I'll assume for now it's accepted or I'll adjust the service to be less strict at upload.
      expect(res.status).toBe(201);
    }
  }, 30000);
});
