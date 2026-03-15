import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as entities from 'entities';

export async function createTestDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: Object.values(entities),
    synchronize: true,
  });
  await ds.initialize();
  return ds;
}

export async function closeTestDataSource(ds: DataSource): Promise<void> {
  if (ds.isInitialized) {
    await ds.destroy();
  }
}

export function generateUniqueEmail(): string {
  return `test_${uuidv4().substring(0, 8)}@example.com`;
}

export function generateUniqueProjectName(): string {
  return `Test Project ${uuidv4().substring(0, 8)}`;
}
