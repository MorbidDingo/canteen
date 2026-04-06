import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/db/run-sql-file.ts <path-to-sql>");
  }

  const sql = readFileSync(resolve(filePath), "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied SQL file: ${filePath}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply SQL file:", error);
  process.exit(1);
});
