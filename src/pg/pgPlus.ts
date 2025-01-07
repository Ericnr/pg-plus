import { Pool, PoolClient, QueryResult } from 'pg';
import { DatabaseError } from 'pg-protocol';
import { deepCamelCaseKeys, deepSnakeCaseKeys } from '../utils/casing';
import pgTx from 'pg-tx';
import { hrtime } from '../utils/hrtime';
import { ToPostgres } from './typeOverrides';
import { BaseQueryConfig, compileConfig, QueryConfig, sql } from './sqlTag';
import { makeQueryBuilder } from './queryBuilder';
import { QueryCreator } from '../../node_modules/kysely/dist/cjs';

interface DBInterface {
  [x: string]: {
    id: string & { __brand: string };
    table: Record<string, any>;
    insertable: Record<string, any>;
    updater: Record<string, any>;
  };
}

export type Pg<DB extends DBInterface> = {
  getDriver: () => Pool | PoolClient;

  query<T extends Record<string, any>>(
    sqlTag: QueryConfig
  ): Promise<QueryResult<T>>;
  one<T extends {}>(sqlTag: QueryConfig): Promise<T>;
  many<T extends Record<string, any>>(sqlTag: QueryConfig): Promise<T[]>;
  any<T extends Record<string, any>>(sqlTag: QueryConfig): Promise<T[]>;
  maybeOne<T extends Record<string, any>>(
    sqlTag: QueryConfig
  ): Promise<T | null>;
  tx<T>(cb: (t: Pg<DB>) => Promise<T>): Promise<T>;

  /**
   * @param table Table name you want to insert to
   * @param rows Object or array of objects with the rows properties
   * @param returning Array of columns to be included in the RETURNING clause
   * @returns Array of inserted rows
   */
  insertOne<T extends keyof DB>(
    table: T,
    newRows: DB[T]['insertable'],
    returning?: (keyof DB[T]['table'])[]
  ): Promise<DB[T]['table']>;
  insertMany<T extends keyof DB>(
    table: T,
    newRows: DB[T]['insertable'][],
    returning?: (keyof DB[T]['table'])[]
  ): Promise<DB[T]['table'][]>;

  byUnique<T extends keyof DB, F extends keyof DB[T]['table']>(
    table: T,
    field: F,
    value: DB[T][F]
  ): Promise<DB[T]['table']>;
  manyByUnique<T extends keyof DB, F extends keyof DB[T]['table']>(
    table: T,
    field: F,
    value: DB[T][F][]
  ): Promise<DB[T]['table'][]>;

  byId<T extends keyof DB>(
    table: T,
    ids: DB[T]['table'] extends { id: infer P } ? P : never
  ): Promise<DB[T]['table']>;

  manyById<T extends keyof DB>(
    table: T,
    ids: (DB[T]['table'] extends { id: infer P } ? P : never)[]
  ): Promise<DB[T]['table'][]>;

  builder: QueryCreator<DB>;
};

export type OnQueryEvent = {
  afterTz: number;
  beforeTz: number;
  duration: number;
  query: string;
  params: any[];
  isTx: boolean;
  txLevel: number;
};

export type OnErrorEvent = {
  error: DatabaseError;
  isTx: boolean;
  txLevel: number;
};

export type OnTransactionEvent<
  T extends 'BEGIN' | 'COMMIT' | 'ROLLBACK' = 'BEGIN' | 'COMMIT' | 'ROLLBACK'
> = {
  afterTz: number;
  beforeTz: number;
  duration: T extends 'COMMIT' | 'ROLLBACK' ? number : null;
  error: T extends 'ROLLBACK' ? Error : null;
  query: T;
  txLevel: number;
};

export const enhancePg = <DB extends DBInterface = {}>(
  basePg: Pool | PoolClient,
  ctx: {
    onQuery?: (event: OnQueryEvent) => void;
    onError?: (event: OnErrorEvent) => void;
    onTransaction?: (event: OnTransactionEvent) => void;
    userId?: string;
    txLevel: number;
    isTx: boolean;
  } = {
    isTx: false,
    txLevel: 0,
  }
): Pg<DB> => {
  const onQuery = (sqlTag: BaseQueryConfig, beforeTz: number) => {
    if (ctx.onQuery) {
      const afterTz = hrtime();
      const duration = afterTz - beforeTz;
      ctx.onQuery({
        afterTz,
        beforeTz,
        duration,
        query: sqlTag.query,
        params: sqlTag.params || [],
        isTx: ctx.isTx,
        txLevel: ctx.txLevel,
      });
    }
  };

  const onTransaction = (
    query: 'BEGIN' | 'COMMIT' | 'ROLLBACK',
    beforeTz: number,
    error?: Error
  ) => {
    if (ctx.onTransaction) {
      const afterTz = hrtime();
      const duration = afterTz - beforeTz;
      ctx.onTransaction({
        afterTz,
        beforeTz,
        duration,
        query,
        txLevel: ctx.txLevel + 1,
        error: error ?? null,
      });
    }
  };

  const onError = (error: DatabaseError) => {
    if (ctx.onError) {
      ctx.onError({
        error,
        isTx: ctx.isTx,
        txLevel: ctx.txLevel + 1,
      });
    }
  };

  return {
    // const withVariables = (query, value) =>
    //   `SELECT q.* FROM (${query.replace(
    //     /[; ]*$/,
    //     ''
    //   )}) AS q, (SELECT set_config('my.user_id', '${value}', true)) AS x;`;
    query(config) {
      const compiled = compileConfig(config);
      // ++i % 2 && (compiled.query = withVariables(compiled.query, 'lol'));
      // console.log(compiled.query);
      const beforeTz = hrtime();

      const values = (compiled.params ?? []).map((val) =>
        typeof val[ToPostgres] === 'function' ? val[ToPostgres]() : val
      );
      return basePg
        .query(compiled.query, values)
        .then((res) => {
          res.rows = deepCamelCaseKeys(res.rows);

          onQuery(compiled, beforeTz);

          return res;
        })
        .catch((error) => {
          onQuery(compiled, beforeTz);
          onError(error);
          throw error;
        });
    },
    
    async one<T extends Record<string, any>>(sqlTag: QueryConfig): Promise<T> {
      const row = await this.maybeOne<T>(sqlTag);

      if (row == null) throw Error('Entity not found');

      return row;
    },

    maybeOne<T extends Record<string, any>>(sqlTag): Promise<T | null> {
      return this.query<T>(sqlTag).then((res) => res.rows[0] ?? null);
    },

    any<T extends Record<string, any>>(sqlTag: QueryConfig): Promise<T[]> {
      return this.query<T>(sqlTag).then((res) => res.rows);
    },

    async many<T extends Record<string, any>>(
      sqlTag: QueryConfig
    ): Promise<T[]> {
      const rows = await this.any<T>(sqlTag);

      if (!rows.length) throw Error('Entity not found');

      return rows;
    },

    byId<T extends keyof DB>(
      table: T,
      id: DB[T]['table'] extends { id: infer P } ? P : never
    ): Promise<DB[T]['table']> {
      return this.byUnique(table, 'id', id as DB[T]['table']['id']);
    },

    manyById<T extends keyof DB>(
      table: T,
      ids: (DB[T] extends { id: infer P } ? P : never)[]
    ): Promise<DB[T]['table'][]> {
      return this.manyByUnique(table, 'id', ids as DB[T]['table']['id'][]);
    },

    byUnique(table, field, values) {
      return this.manyByUnique(table, field, [values]).then((rows) => rows[0]);
    },

    async manyByUnique(table, field, values) {
      if (values.length === 0) throw Error('You must supply at least one id');

      const rows = await this.many(sql`
        SELECT * 
        FROM ${sql.id(table as string)} 
        WHERE ${sql.id(field as string)} = ANY(${values as string[]})
      `);

      if (rows.length !== values.length) {
        throw Error('Entities not found');
      }

      return rows;
    },

    insertMany(table, rows, returning) {
      const newRows = [].concat(deepSnakeCaseKeys(rows)); // Example: [{ name: 'Dan' }, { name: 'Steve', age: 25 }]

      const dedup = <T>(array: T[]): T[] => Array.from(new Set(array));
      const columns = dedup(newRows.flatMap((row) => Object.keys(row))); // ['name', 'age']

      const columnsSql = columns.map((col) => `"${col}"`).join(', '); // `"name", "age"`

      let paramIndex = 1;
      const valuesSql = newRows // ($1, DEFAULT), ($2, $3)
        .map((row) => {
          const rowParams = columns
            .map((col, i) => (col in row ? `$${i + paramIndex}` : 'DEFAULT'))
            .join(', ');

          paramIndex += columns.length;
          return `(${rowParams})`;
        })
        .join(', ');

      const params = newRows.reduce((acc, cur) => {
        // ['Dan', 'Steve', 25]
        columns.forEach((column) => {
          if (cur[column]) acc.push(cur[column]);
        });

        return acc;
      }, [] as any[]);

      const returningSql = returning
        ? returning.map((col) => sql.id(col as string)).join(', ')
        : '*';

      return this.any({
        query: `INSERT INTO "${
          table as string
        }" (${columnsSql})\nVALUES ${valuesSql}\nRETURNING ${returningSql}`,
        params,
      });
    },

    insertOne(table, row, returning) {
      return this.insertMany(table, [row], returning).then(
        (response) => response[0]
      );
    },

    tx(cb) {
      const beforeTz = hrtime();
      return pgTx(basePg, (t) => {
        onTransaction('BEGIN', beforeTz);

        const db = enhancePg<DB>(t, {
          ...ctx,
          txLevel: ctx.txLevel,
        });

        return cb(db);
      })
        .then((res) => {
          onTransaction('COMMIT', beforeTz);

          return res;
        })
        .catch((error) => {
          onTransaction('ROLLBACK', beforeTz, error);

          throw error;
        });
    },

    getDriver: () => basePg,

    builder: makeQueryBuilder(basePg),
  };
};
