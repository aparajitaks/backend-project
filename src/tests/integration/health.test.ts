import request from 'supertest';
import { app } from '../../app';

describe('GET /api/health integration tests', () => {
  it('returns 200 with status ok and valid fields', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBeTrue();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('connected');
    expect(res.body.data.redis).toBeString();
    expect(typeof res.body.data.uptime).toBe('number');
    expect(new Date(res.body.data.timestamp).getTime()).not.toBeNaN();
    expect(['bullmq', 'memory']).toContain(res.body.data.queue);
  });
});
