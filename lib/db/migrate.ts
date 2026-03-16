import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("Migrations complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
