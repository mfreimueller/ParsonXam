import { afterAll, beforeAll } from 'vitest';
import { createTestDb, dropTestDb, setDb, resetDb, type TestDb } from '../src/db/connection.js';

// Gives the test file its own migrated database and points the app at it.
export function useTestDb(): { current: () => TestDb } {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await createTestDb();
    setDb(testDb.db);
  });
  afterAll(async () => {
    resetDb();
    await dropTestDb(testDb);
  });
  return { current: () => testDb };
}
