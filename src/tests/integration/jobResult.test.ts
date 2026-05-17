import request from 'supertest';
import { app } from '../../app';
import { cleanDb, createTestJob } from '../setup/testHelpers';
import { testPrisma } from '../setup/testDb';

describe('GET /api/jobs/:id/result integration tests', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns 202 status message when job is still pending', async () => {
    const job = await createTestJob({ status: 'pending' });
    const res = await request(app).get(`/api/jobs/${job.id}/result`);

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.message).toContain('still being processed');
  });

  it('returns 202 status message when job is processing', async () => {
    const job = await createTestJob({ status: 'processing' });
    const res = await request(app).get(`/api/jobs/${job.id}/result`);
    expect(res.status).toBe(202);
  });

  it('returns full result when job is completed', async () => {
    const job = await createTestJob({ status: 'completed' });
    await testPrisma.jobResult.create({
      data: {
        jobId: job.id,
        overallPassed: true,
        overallConfidence: 0.95,
        checks: [
          { name: 'blurDetection', passed: true, confidence: 1.0, detail: 'OK' },
          { name: 'brightnessCheck', passed: true, confidence: 1.0, detail: 'OK' },
          { name: 'dimensionCheck', passed: true, confidence: 1.0, detail: 'OK' },
          { name: 'screenshotDetection', passed: true, confidence: 1.0, detail: 'OK' },
          { name: 'numberPlateOCR', passed: true, confidence: 1.0, detail: 'OK' },
          { name: 'duplicateDetection', passed: true, confidence: 1.0, detail: 'OK' },
        ],
        isDuplicate: false,
      },
    });

    const res = await request(app).get(`/api/jobs/${job.id}/result`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBeTrue();
    expect(res.body.data.checks).toHaveLength(6);
    expect(typeof res.body.data.overallPassed).toBe('boolean');
    expect(res.body.data.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(res.body.data.processedAt).toBeString();
  });

  it('returns failureReason when job is failed', async () => {
    const job = await createTestJob({ status: 'failed', failureReason: 'Unreadable image file' });
    const res = await request(app).get(`/api/jobs/${job.id}/result`);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Unreadable image file');
  });

  it('returns 404 for unknown jobId', async () => {
    const res = await request(app).get('/api/jobs/missing-id/result');
    expect(res.status).toBe(404);
  });
});
