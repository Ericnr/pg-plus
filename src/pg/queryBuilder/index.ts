import {
  PostgresQueryCompiler,
  DefaultQueryExecutor,
  CamelCasePlugin,
  QueryCreator,
  DefaultConnectionProvider,
  SingleConnectionProvider,
  PostgresAdapter,
} from 'kysely';
import { Pool, PoolClient } from 'pg';
import { PostgresConnection, PostgresDriver } from './kyselyDriver';

export const makeQueryBuilder = <DB>(pool: Pool | PoolClient) => {
  const adapter = new PostgresAdapter();
  const compiler = new PostgresQueryCompiler();

  const provider =
    'release' in pool
      ? new SingleConnectionProvider(
          new PostgresConnection(pool, { cursor: null })
        )
      : new DefaultConnectionProvider(new PostgresDriver({ pool }));

  const executor = new DefaultQueryExecutor(compiler, adapter, provider, [
    new CamelCasePlugin(),
  ]);

  return new QueryCreator<DB>({ executor });
};
