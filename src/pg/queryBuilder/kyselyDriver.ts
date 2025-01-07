import {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  PostgresCursorConstructor,
  PostgresDialectConfig,
  PostgresPool,
  PostgresPoolClient,
  QueryResult,
  TransactionSettings,
} from 'kysely';
import { isFunction, isObject, isString } from 'lodash';
// import {
//   DatabaseConnection,
//   QueryResult,
//   Driver,
//   CompiledQuery,
//   PostgresDialectConfig,
// } from 'kysely';

const PRIVATE_RELEASE_METHOD = Symbol();

export class PostgresDriver implements Driver {
  readonly #config: PostgresDialectConfig;
  readonly #connections = new WeakMap<PostgresPoolClient, DatabaseConnection>();
  #pool?: PostgresPool;

  constructor(config: PostgresDialectConfig) {
    this.#config = Object.freeze({ ...config });
  }

  async init(): Promise<void> {
    if (!this.#pool)
      this.#pool = isFunction(this.#config.pool)
        ? await this.#config.pool()
        : this.#config.pool;
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    await this.init();
    const client = await this.#pool!.connect();
    let connection = this.#connections.get(client);

    if (!connection) {
      connection = new PostgresConnection(client, {
        cursor: this.#config.cursor ?? null,
      });
      this.#connections.set(client, connection);

      // The driver must take care of calling `onCreateConnection` when a new
      // connection is created. The `pg` module doesn't provide an async hook
      // for the connection creation. We need to call the method explicitly.
      if (this.#config.onCreateConnection) {
        await this.#config.onCreateConnection(connection);
      }
    }

    return connection;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings
  ): Promise<void> {
    if (settings.isolationLevel) {
      await connection.executeQuery(
        CompiledQuery.raw(
          `start transaction isolation level ${settings.isolationLevel}`
        )
      );
    } else {
      await connection.executeQuery(CompiledQuery.raw('begin'));
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  async releaseConnection(connection: PostgresConnection): Promise<void> {
    connection[PRIVATE_RELEASE_METHOD]();
  }

  async destroy(): Promise<void> {
    if (this.#pool) {
      const pool = this.#pool;
      this.#pool = undefined;
      await pool.end();
    }
  }
}

interface PostgresConnectionOptions {
  cursor: PostgresCursorConstructor | null;
}

export class PostgresConnection implements DatabaseConnection {
  #client: PostgresPoolClient;
  #options: PostgresConnectionOptions;

  constructor(client: PostgresPoolClient, options: PostgresConnectionOptions) {
    this.#client = client;
    this.#options = options;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    try {
      const result = await this.#client.query<O>(compiledQuery.sql, [
        ...compiledQuery.parameters,
      ]);

      if (
        result.command === 'INSERT' ||
        result.command === 'UPDATE' ||
        result.command === 'DELETE'
      ) {
        const numAffectedRows = BigInt(result.rowCount);

        return {
          // TODO: remove.
          numUpdatedOrDeletedRows: numAffectedRows,
          numAffectedRows,
          rows: result.rows ?? [],
        };
      }

      return {
        rows: result.rows ?? [],
      };
    } catch (err) {
      throw extendStackTrace(err, new Error());
    }
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    chunkSize: number
  ): AsyncIterableIterator<QueryResult<O>> {
    if (!this.#options.cursor) {
      throw new Error(
        "'cursor' is not present in your postgres dialect config. It's required to make streaming work in postgres."
      );
    }

    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error('chunkSize must be a positive integer');
    }

    const cursor = this.#client.query(
      new this.#options.cursor<O>(
        compiledQuery.sql,
        compiledQuery.parameters.slice()
      )
    );

    try {
      while (true) {
        const rows = await cursor.read(chunkSize);

        if (rows.length === 0) {
          break;
        }

        yield {
          rows,
        };
      }
    } finally {
      await cursor.close();
    }
  }

  [PRIVATE_RELEASE_METHOD](): void {
    this.#client.release();
  }
}

function extendStackTrace(err: unknown, stackError: Error): unknown {
  if (isStackHolder(err) && stackError.stack != null) {
    // Remove the first line that just says `Error`.
    const stackExtension = stackError.stack.split('\n').slice(1).join('\n');

    err.stack += `\n${stackExtension}`;
    return err;
  }

  return err;
}

interface StackHolder {
  stack: string;
}

function isStackHolder(obj: unknown): obj is StackHolder {
  return isObject(obj) && 'stack' in obj && isString(obj.stack);
}
