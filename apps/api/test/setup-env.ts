import { getTestDatabaseUrl } from './test-database.mjs';

// Vitest を直接起動した場合も、DB 接続前に専用 DB だけを選ぶ。
process.env.DATABASE_URL = getTestDatabaseUrl();
