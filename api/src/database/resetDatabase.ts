import { dataSource } from 'database/createConnection';

const resetDatabase = async (): Promise<void> => {
  await dataSource.dropDatabase();
  await dataSource.synchronize();
};

export default resetDatabase;
