import request from 'supertest';
import { app } from '../../app';
import { cleanDb, createTestJob } from '../setup/testHelpers';

describe('GET /api/jobs integration tests', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns { success: true, data: { jobs, total, limit, offset } }', async () => {
    await createTestJob({ status: 'pending' });
    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body.success).toBeTrue();
    expect(res.body.data.jobs).toBeArray();
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.limit).toBe(20);
    expect(res.body.data.offset).toBe(0);
  });

  it('?limit=2 returns at most 2 jobs', async () => {
    await createTestJob();
    await createTestJob();
    await createTestJob();
    const res = await request(app).get('/api/jobs?limit=2');
    expect(res.body.data.jobs).toHaveLength(2);
  });

  it('?status=pending returns only pending jobs', async () => {
    await createTestJob({ status: 'pending' });
    await createTestJob({ status: 'completed' });
    const res = await request(app).get('/api/jobs?status=pending');
    expect(res.body.data.jobs).toHaveLength(1);
    expect(res.body.data.jobs[0].status).toBe('pending');
  });

  it('invalid status param returns 400', async () => {
    const res = await request(app).get('/api/jobs?status=invalid');
    expect(res.status).toBe(400);
  });

  it('limit > 100 returns 400', async () => {
    const res = await request(app).get('/api/jobs?limit=101');
    expect(res.status).toBe(400);
  });

  it('meta.hasMore is true when more results exist', async () => {
    await createTestJob();
    await createTestJob();
    const res = await request(app).get('/api/jobs?limit=1');
    expect(res.body.meta.hasMore).toBeTrue();
  });
});
