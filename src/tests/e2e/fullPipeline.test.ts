import request from 'supertest';
import { app } from '../../app';
import { cleanDb, waitForStatus } from '../setup/testHelpers';
import { createValidImage } from '../fixtures/validImage';
import { startWorker } from '../../queue/index';

describe('Full Pipeline E2E Flow', () => {
  beforeAll(async () => {
    // Start the worker to process jobs during the test
    await startWorker();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('Happy path: upload → process → result', async () => {
    const buffer = await createValidImage();

    // Step 1: Upload
    const uploadRes = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'e2e-test.jpg');

    expect(uploadRes.status).toBe(201);
    const { jobId } = uploadRes.body.data;

    // Step 2: Check status (should be pending or processing)
    const statusRes = await request(app).get(`/api/jobs/${jobId}/status`);
    expect(['pending', 'processing', 'completed']).toContain(statusRes.body.data.status);

    // Step 3: Wait for completion
    await waitForStatus(jobId, 'completed', 20000);

    // Step 4: Get final result
    const resultRes = await request(app).get(`/api/jobs/${jobId}/result`);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.data.overallConfidence).toBeGreaterThan(0.5);
    expect(resultRes.body.data.checks).toHaveLength(6);

    // Step 5: Final status check
    const finalStatus = await request(app).get(`/api/jobs/${jobId}/status`);
    expect(finalStatus.body.data.status).toBe('completed');
  }, 30000);
});
