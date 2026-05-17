import request from 'supertest';
import { app } from '../../app';
import { createValidImage } from '../fixtures/validImage';

describe('POST /api/upload rate limiting integration tests', () => {
  it('11th request returns 429', async () => {
    const buffer = await createValidImage();
    
    // Send 10 requests (assuming 10 is the limit as per upload.ts)
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/upload')
        .attach('image', buffer, `test-${i}.jpg`);
      expect(res.status).not.toBe(429);
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    }

    // 11th request
    const res = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'test-11.jpg');

    expect(res.status).toBe(429);
    expect(res.body.success).toBeFalse();
    expect(res.body.error).toContain('Too many requests');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });
});
