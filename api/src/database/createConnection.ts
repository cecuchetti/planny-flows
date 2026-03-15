import path from 'path';
import fs from 'fs';

import { DataSource, DataSourceOptions } from 'typeorm';

import * as entities from 'entities';
import { appConfig } from 'config';

const getDataSourceOptions = (): DataSourceOptions => {
  const common = {
    entities: Object.values(entities),
    synchronize: true,
  };

  if (appConfig.db.type === 'sqlite') {
    const dbPath = appConfig.db.path;
    const dir = path.dirname(dbPath);
    if (!path.isAbsolute(dbPath)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore if already exists or not writable
      }
    }
    return {
      type: 'better-sqlite3',
      database: dbPath,
      ...common,
    };
  }

  return {
    type: 'postgres',
    host: appConfig.db.host,
    port: appConfig.db.port,
    username: appConfig.db.username,
    password: appConfig.db.password,
    database: appConfig.db.database,
    ...common,
  };
};

export const dataSource = new DataSource(getDataSourceOptions());

const createDatabaseConnection = (): Promise<DataSource> => dataSource.initialize();

export default createDatabaseConnection;
