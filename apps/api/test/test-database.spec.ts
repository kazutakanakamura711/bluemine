import { describe, expect, it } from 'vitest';
import { validateTestDatabaseUrl } from './test-database.mjs';

const developmentUrl =
  'postgresql://dev:dev@localhost:5432/bluemine?schema=public';
const testUrl =
  'postgresql://test:test@localhost:5433/bluemine_test?schema=public';

describe('E2E 用 DB の接続先', () => {
  it('専用 DB の URL を受け付ける', () => {
    expect(validateTestDatabaseUrl(testUrl, developmentUrl)).toBe(testUrl);
  });

  it('TEST_DATABASE_URL がない場合は停止する', () => {
    expect(() => validateTestDatabaseUrl(undefined, developmentUrl)).toThrow(
      'TEST_DATABASE_URL が設定されていません',
    );
  });

  it('開発 DB と同じ接続先は表記やユーザーが異なっても停止する', () => {
    const development =
      'postgresql://dev:dev@localhost:5432/bluemine_test?schema=public';
    const sameDatabase =
      'postgres://other:other@127.0.0.1/bluemine_test?schema=other';

    expect(() => validateTestDatabaseUrl(sameDatabase, development)).toThrow(
      '開発用 DATABASE_URL と同じ DB',
    );
  });

  it('テスト用でない DB 名は停止する', () => {
    expect(() => validateTestDatabaseUrl(developmentUrl, testUrl)).toThrow(
      'DB 名は _test で終わる必要があります',
    );
  });

  it('不正な接続 URL は停止する', () => {
    expect(() => validateTestDatabaseUrl('invalid', developmentUrl)).toThrow(
      '有効な PostgreSQL URL',
    );
  });
});
