import { Pool, types } from 'pg';
import Decimal from 'decimal.js';
import { objectToPostgres, TypeId } from './typeOverrides';
import { pgQueryLogger, pgErrorLogger, pgTransactionLogger } from './pgLogger';
import { enhancePg } from './pgPlus';

objectToPostgres(Decimal, (val) => val.toString());

export const createPgPool = (
  connectionInfo:
    | {
        host: string;
        user: string;
        database: string;
        port: number;
        password?: string;
      }
    | { connectionString: string }
): any => {
  const pg = new Pool(connectionInfo);

  types.setTypeParser(TypeId.NUMERIC, (str) => new Decimal(str));

  return enhancePg(pg, {
    onQuery: pgQueryLogger,
    onError: pgErrorLogger,
    onTransaction: pgTransactionLogger,
    isTx: false,
    txLevel: 0,
  });
};

// const pg = enhancePg(
//   new Pool({
//     connectionString: environment.DB_URL,
//     max: 1,
//   })
// );

// (async () => {
//   // await query(pg, `SELECT current_setting('my.user_id');;`, [], 5).then(
//   //   x => console.log(x.rows[0].current_setting) // logs '5'
//   // );

//   await pg.query({ query: `SELECT id, current_setting('my.user_id') FROM users` }).then(t => {
//     console.log(t.rows[0]); // logs ''
//   });

//   await pg.query({ query: `SELECT id, current_setting('my.user_id') FROM users` }).then(t => {
//     console.log(t.rows[0]); // logs ''
//   });

//   await pg.query({ query: `SELECT id, current_setting('my.user_id') FROM users` }).then(t => {
//     console.log(t.rows[0]); // logs ''
//   });

//   // await pg.query(`SELECT current_setting('my.user_id')`).then(t => {
//   //   console.log(t.rows[0].current_setting); // logs ''
//   // });
// })();

// (async () => {
//   // await query(pg, `SELECT current_setting('my.user_id');`, [], 5).then(
//   //   x => console.log(x.rows[0].current_setting) // logs '5'
//   // );
//   const conn = await pg.connect();
//   await conn.query('begin');
//   await conn
//     .query(
//       `SELECT x.* FROM (SELECT set_config('my.user_id', '5', true)) AS u, (SELECT current_setting('my.user_id')) AS x`
//     )
//     .then(t => {
//       console.log(JSON.stringify(t.rows, null, 2)); // logs '5'
//     });

//   await conn.query(`SELECT current_setting('my.user_id');`).then(t => {
//     console.log(JSON.stringify(t.rows)); // logs '5'
//   });

//   await conn.query('rollback');
//   console.log(pg.totalCount); // 1
// })();
