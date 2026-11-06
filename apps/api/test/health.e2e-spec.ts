import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('Health endpoint', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('正常なステータスを返す', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect({
      status: 'ok',
    });
  });

  // body-parser の更新後も、本文解析の成功・失敗で API が利用できることを確認する。
  describe.each([
    { encoding: 'gzip', compress: gzipSync },
    { encoding: 'deflate', compress: deflateSync },
    { encoding: 'br', compress: brotliCompressSync },
  ])('$encoding のリクエスト本文', ({ encoding, compress }) => {
    it('有効なJSONは解析後に既存の認証で拒否し、APIは応答を続ける', async () => {
      const body = compress(
        Buffer.from(JSON.stringify({ name: '本文解析の確認' })),
      );

      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding)
        // 圧縮済みBufferを、Superagentが再度JSONに変換しないようにする。
        .serialize((value) => value)
        .send(body)
        .expect(401);

      await request(app.getHttpServer()).get('/api/health').expect(200);
    });

    it('JSONの構文エラーは400になり、APIは応答を続ける', async () => {
      const body = compress(Buffer.from('{'));

      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', encoding)
        .serialize((value) => value)
        .send(body)
        .expect(400);

      await request(app.getHttpServer()).get('/api/health').expect(200);
    });
  });
});
