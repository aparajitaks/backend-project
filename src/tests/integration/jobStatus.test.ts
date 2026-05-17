import request from 'supertest';
import { app } from '../../app';
import { cleanDb, createTestJob } from '../setup/testHelpers';

describe('GET /api/jobs/:id/status integration tests', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns 200 with status data for existing job', async () => {
    const job = await createTestJob({ status: 'processing' });
    const res = await request(app).get(`/api/jobs/${job.id}/status`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBeTrue();
    expect(res.body.data.jobId).toBe(job.id);
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.createdAt).toBeString();
    expect(res.body.data.updatedAt).toBeString();
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/jobs/non-existent-id/status');
    expect(res.status).toBe(404);
    expect(res.body.success).toBeFalse();
    expect(res.body.error).toContain('Job not found');
  });

  it('status is one of: pending, processing, completed, failed', async () => {
    const job = await createTestJob({ status: 'completed' });
    const res = await request(app).get(`/api/jobs/${job.id}/status`);
    expect(['pending', 'processing', 'completed', 'failed']).toContain(res.body.data.status);
  });
});
