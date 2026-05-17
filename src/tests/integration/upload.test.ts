import request from 'supertest';
import { app } from '../../app';
import { cleanDb } from '../setup/testHelpers';
import { createValidImage } from '../fixtures/validImage';
import { createTinyImage } from '../fixtures/tinyImage';
import { createCorruptedFile } from '../fixtures/corruptedFile';
import fs from 'fs';
import path from 'path';

describe('POST /api/upload integration tests', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns 201 with success payload for valid image', async () => {
    const buffer = await createValidImage();
    const res = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'test.jpg');

    expect(res.status).toBe(201);
    expect(res.body.success).toBeTrue();
    expect(res.body.data.jobId).toBeString();
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.filename).toBeString();
    expect(res.body.data.uploadedAt).toBeString();
    expect(new Date(res.body.data.uploadedAt).getTime()).not.toBeNaN();
  });

  it('file is saved to UPLOAD_DIR on disk', async () => {
    const buffer = await createValidImage();
    const res = await request(app)
      .post('/api/upload')
      .attach('image', buffer, 'saved-test.jpg');

    const filename = res.body.data.filename;
    const uploadDir = process.env['UPLOAD_DIR'] || './uploads-test';
    const filePath = path.join(uploadDir, filename);
    expect(fs.existsSync(filePath)).toBeTrue();
  });

  it('returns 400 if no file attached', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No file received');
  });

  it('returns 400 for zero-byte file', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('image', Buffer.alloc(0), 'empty.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cannot be empty');
  });

  it('returns 400 (or 415) for a .txt file upload', async () => {
    // Our validator handles this
    const res = await request(app)
      .post('/api/upload')
      .attach('image', Buffer.from('hello world'), 'test.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only jpeg, png, and webp');
  });

  it('returns 400 for missing Content-Type multipart', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Content-Type', 'application/json')
      .send({ some: 'data' });
    expect(res.status).toBe(400);
  });
});
