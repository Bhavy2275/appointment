import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is missing. Please add it to your .env file.');
  }

  // In Next.js, hot reloading in development can cause multiple Pool instances to be created,
  // leading to connection pool exhaustion. We cache the pool globally.
  const globalForDb = global as unknown as { pool: Pool };

  if (process.env.NODE_ENV === 'production') {
    pool = new Pool({
      connectionString,
      // Enable SSL configuration for Supabase connections (required)
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } else {
    if (!globalForDb.pool) {
      globalForDb.pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
    pool = globalForDb.pool;
  }

  return pool;
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const activePool = getPool();
    const res = await activePool.query(text, params);
    const duration = Date.now() - start;
    // Log query details in dev environment
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

export default pool;
