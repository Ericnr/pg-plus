import Decimal from 'decimal.js';
import postgres, {
  ParameterOrFragment,
  PendingQuery,
  Row,
  Sql,
} from 'postgres';
import { deepSnakeCaseKeys } from '../utils/casing';
import { makePgConnectionString } from '../utils/makePgConnectionString';
import { TypeId } from '../pg/typeOverrides';
import { extendFunction } from '../utils/extendFunction';

interface TransactionSql<
  DB extends DBInterface,
  TTypes extends Record<string, unknown> = {},
> extends Pg<DB, TTypes> {
  savepoint<T>(
    cb: (sql: TransactionSql<DB, TTypes>) => T | Promise<T>
  ): Promise<UnwrapPromiseArray<T>>;
  savepoint<T>(
    name: string,
    cb: (sql: TransactionSql<DB, TTypes>) => T | Promise<T>
  ): Promise<UnwrapPromiseArray<T>>;

  prepare<T>(name: string): Promise<UnwrapPromiseArray<T>>;
}

interface ReservedSql<
  DB extends DBInterface,
  TTypes extends Record<string, unknown> = {},
> extends Pg<DB, TTypes> {
  release(): void;
}

type UnwrapPromiseArray<T> = T extends any[]
  ? {
      [k in keyof T]: T[k] extends Promise<infer R> ? R : T[k];
    }
  : T;

interface DBInterface {
  [x: string]: {
    id: string & { __brand: string };
    table: Record<string, any>;
    insertable: Record<string, any>;
    updater: Record<string, any>;
  };
}

export interface Pg<
  DB extends DBInterface = {},
  TTypes extends Record<string, unknown> = {},
> extends Sql<TTypes> {
  <T extends object | undefined = Row>(
    template: TemplateStringsArray,
    ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  ): PendingQuery<T[]>;
  // <T extends Row>(
  //   template: TemplateStringsArray,
  //   ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  // ): Promise<T[]>;
  reserve: () => Promise<ReservedSql<DB, TTypes>>;

  begin<T>(
    cb: (sql: TransactionSql<DB, TTypes>) => T | Promise<T>
  ): Promise<UnwrapPromiseArray<T>>;
  begin<T>(
    options: string,
    cb: (sql: TransactionSql<DB, TTypes>) => T | Promise<T>
  ): Promise<UnwrapPromiseArray<T>>;

  one<T extends Row>(
    template: TemplateStringsArray,
    ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  ): Promise<T>;
  many<T extends Row>(
    template: TemplateStringsArray,
    ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  ): Promise<T[]>;
  any<T extends Row>(
    template: TemplateStringsArray,
    ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  ): Promise<T[]>;
  maybeOne<T extends Row>(
    template: TemplateStringsArray,
    ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  ): Promise<T | null>;

  /**
   * @param table Table name you want to insert to
   * @param rows Object or array of objects with the rows properties
   * @param returning Array of columns to be included in the RETURNING clause
   * @returns Array of inserted rows
   */
  insertOne<T extends keyof DB>(
    table: T,
    newRow: DB[T]['insertable'],
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
}

export const makePostgres = <
  DB extends DBInterface,
  TTypes extends Record<string, any> = {},
>(
  baseSql: Sql<TTypes>
) => {
  // const sql = <T extends Row>(
  //   template: TemplateStringsArray,
  //   ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
  // ): Promise<T[]> => {
  //   // const beforeTz = hrtime();
  //   return baseSql<T[]>(template, ...parameters)
  //     .then((res) => {
  //       // onQuery(compiled, beforeTz);

  //       return res;
  //     })
  //     .catch((error) => {
  //       // onQuery(compiled, beforeTz);
  //       // onError(error);
  //       throw error;
  //     });
  // };

  const sql: Pg<DB, TTypes> = extendFunction(baseSql, {
    async reserve() {
      const conn = await baseSql.reserve();
      return extendFunction(makePostgres<DB, TTypes>(conn), {
        release: conn.release,
      }) as unknown as ReservedSql<DB, TTypes>;
    },

    begin(cb) {
      // const beforeTz = hrtime();
      // console.log(baseSql.begin);
      // console.log(baseSql.end);
      // console.log(baseSql.options);
      return baseSql
        .begin((tx) => {
          // onTransaction('BEGIN', beforeTz);
          // make tx.begin a no-op?
          const db = makePostgres<DB, TTypes>(tx);

          return cb(db);
        })
        .then((res) => {
          // onTransaction('COMMIT', beforeTz);

          return res;
        })
        .catch((error) => {
          // onTransaction('ROLLBACK', beforeTz, error);

          throw error;
        });
    },

    maybeOne<T extends Record<string, any>>(
      template: TemplateStringsArray,
      ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
    ): Promise<T | null> {
      return sql<T>(template, ...parameters).then((rows) => rows[0] ?? null);
    },

    async one<T extends Row>(
      template: TemplateStringsArray,
      ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
    ): Promise<T> {
      const row = await this.maybeOne<T>(template, ...parameters);

      if (row == null) throw Error('Entity not found');

      return row;
    },

    async any<T extends Record<string, any>>(
      template: TemplateStringsArray,
      ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
    ): Promise<T[]> {
      return await sql<T>(template, ...parameters);
    },

    async many<T extends Record<string, any>>(
      template: TemplateStringsArray,
      ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
    ): Promise<T[]> {
      const rows = await this.any<T>(template, ...parameters);

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

    async manyByUnique<T extends keyof DB, F extends keyof DB[T]['table']>(
      table: T,
      field: F,
      values: DB[T][F][]
    ) {
      if (values.length === 0) throw Error('You must supply at least one id');

      const rows = await this.many`
        SELECT * 
        FROM ${baseSql(table as string)} 
        WHERE ${baseSql(field as string)} = ANY(${values as string[]})
      `;

      if (rows.length !== values.length) {
        throw Error('Entities not found');
      }

      return rows;
    },

    insertMany<T extends keyof DB>(
      table: T,
      rows: DB[T]['insertable'][],
      returning?: (keyof DB[T]['table'])[]
    ): Promise<DB[T]['table'][]> {
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
        ? returning.map((col) => baseSql(col as string)).join(', ')
        : '*';

      return baseSql
        .unsafe(
          `INSERT INTO "${
            table as string
          }" (${columnsSql})\nVALUES ${valuesSql}\nRETURNING ${returningSql}`,
          params
        )
        .execute();
    },

    insertOne<T extends keyof DB>(
      table: T,
      newRow: DB[T]['insertable'],
      returning?: (keyof DB[T]['table'])[]
    ): Promise<DB[T]['table']> {
      return this.insertMany(table, [newRow], returning).then(
        (response) => response[0]
      );
    },
  });

  return sql as Pg<DB, TTypes>;
};

export const createPgPool = (
  connection:
    | {
        host: string;
        user: string;
        database: string;
        port: number;
        password?: string;
      }
    | string
) => {
  const string =
    typeof connection === 'string'
      ? connection
      : makePgConnectionString(connection);

  const sql = postgres(string, {
    transform: postgres.camel,
    types: {
      numeric: {
        from: [TypeId.NUMERIC] as number[],
        to: TypeId.NUMERIC,
        serialize: (x: Decimal) => x.toString() as unknown,
        parse: (x: any) => new Decimal(x),
      },
    },
  });

  return makePostgres(sql) as DB;
};

type DatabaseSchema = {}
export type DB = Pg<DatabaseSchema, { numeric: Decimal }>;
