import session from 'express-session';
import { Pg } from '../postgres/postgresPlus';

export class PgSessionStore extends session.Store {
  sql: Pg<any, any>;

  constructor({ sql }: { sql: Pg<any, any> }) {
    super();
    this.sql = sql;
  }

  set(sid, session, callback) {
    if (!session.user) return callback();
    this.sql`
      insert into session (sid, sess, expire)
        values (${sid}, ${JSON.stringify(session, null, 2)}, ${Number(session.cookie.expires)})
        on conflict (sid) do update set
        sess = $2,
        expire = now() + interval '14 days'
    `.then(() => callback(), callback);
  }

  get(sid, callback) {
    this.sql<{ sess: string }>`
      select sid, sess, expire
      from session
      where sid = ${sid} and expire > now()
    `.then(([result]) => {
      callback(null, result != null ? JSON.parse(result.sess) : null);
    }, callback);
  }

  touch(sid, _session, callback) {
    this.sql`
      update session
      set
        expire = now() + interval '14 days'
      where sid = ${sid}
    `.then(() => callback(), callback);
  }

  destroy(sid, callback) {
    this.sql`
      delete from session
      where sid = ${sid}
    `.then(() => callback(), callback);
  }
}
