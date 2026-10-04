// Applies SQL migrations as the owner role. Usage: pnpm db:migrate
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
export async function runMigrations(url) {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
        await migrate(drizzle(pool), { migrationsFolder: new URL('../../migrations', import.meta.url).pathname });
    }
    finally {
        await pool.end();
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const url = process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not set');
    await runMigrations(url);
    console.log('Migrations applied.');
}
//# sourceMappingURL=migrate.js.map