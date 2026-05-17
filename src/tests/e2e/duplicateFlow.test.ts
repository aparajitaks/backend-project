import request from 'supertest';
import { app } from '../../app';
import { cleanDb, waitForStatus } from '../setup/testHelpers';
import { createValidImage } from '../fixtures/validImage';
import { startWorker, closeWorker, closeQueue } from '../../queue/index';
import { closeRedis } from '../../queue/redisClient';

describe('Duplicate Detection E2E Flow', () => {
  beforeAll(async () => {
    await startWorker();
  });

  afterAll(async () => {
    await closeWorker();
    await closeQueue();
    await closeRedis();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  it('detects duplicate after second upload', async () => {
    const buffer = await createValidImage();

    // 1. First upload
    const res1 = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'first.jpg');
    const jobId1 = res1.body.data.jobId;
    await waitForStatus(jobId1, 'completed');

    // 2. Second upload (same buffer)
    const res2 = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'second.jpg');
    const jobId2 = res2.body.data.jobId;
    await waitForStatus(jobId2, 'completed');

    // 3. Verify second job is duplicate
    const result2 = await request(app).get(`/api/jobs/${jobId2}/result`);
    expect(result2.body.data.isDuplicate).toBeTrue();
    expect(result2.body.data.duplicateOfJobId).toBe(jobId1);

    const dupCheck = result2.body.data.checks.find((c: any) => c.name === 'duplicateDetection');
    expect(dupCheck.passed).toBeFalse();

    // 4. Verify first job is NOT duplicate
    const result1 = await request(app).get(`/api/jobs/${jobId1}/result`);
    expect(result1.body.data.isDuplicate).toBeFalse();
  }, 30000);
});
