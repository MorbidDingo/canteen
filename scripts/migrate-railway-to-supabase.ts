/**
 * One-time migration: Railway PostgreSQL → Supabase PostgreSQL
 * 
 * Usage: npx tsx scripts/migrate-railway-to-supabase.ts
 * 
 * Steps:
 * 1. Pushes schema to Supabase via drizzle (already done with db:push)
 * 2. Reads all tables from Railway
 * 3. Inserts data into Supabase in FK-safe order
 * 4. Resets sequences to max(id)+1
 */

import pg from "pg";
const { Client } = pg;

const OLD_URL = "postgresql://postgres:XJnzQkUxhDbwXPwCKuJDfrXwtQUAusJr@gondola.proxy.rlwy.net:35086/railway";
const NEW_URL = "postgresql://postgres.xrxbdftqiinnnifxzruz:XJnzQkUxhDbwXPwCKuJDfrXwtQUAusJr@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

async function run() {
  const source = new Client({ connectionString: OLD_URL });
  const target = new Client({ connectionString: NEW_URL });

  await source.connect();
  await target.connect();
  console.log("✓ Connected to both databases");

  // Get all user tables from the source, sorted to handle FKs
  const { rows: tables } = await source.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('__drizzle_migrations', 'spatial_ref_sys')
    ORDER BY tablename
  `);
  
  const tableNames = tables.map((t: { tablename: string }) => t.tablename);
  console.log(`Found ${tableNames.length} tables to migrate`);

  // Disable FK checks on target during insert
  await target.query("SET session_replication_role = 'replica';");

  let totalRows = 0;
  const errors: string[] = [];

  for (const table of tableNames) {
    try {
      // Count rows in source
      const { rows: countRows } = await source.query(`SELECT COUNT(*) as c FROM "${table}"`);
      const count = parseInt(countRows[0].c);
      
      if (count === 0) {
        console.log(`  ⏭ ${table} — empty, skipping`);
        continue;
      }

      // Clear target table first
      await target.query(`DELETE FROM "${table}"`);

      // Fetch all data
      const { rows, fields } = await source.query(`SELECT * FROM "${table}"`);
      
      if (rows.length === 0) continue;

      // Build INSERT using parameterized batches
      const colNames = fields.map((f: { name: string }) => `"${f.name}"`).join(", ");
      const batchSize = 100;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values: unknown[] = [];
        const valueClauses: string[] = [];

        for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
          const row = batch[rowIdx];
          const placeholders: string[] = [];
          for (let colIdx = 0; colIdx < fields.length; colIdx++) {
            const paramNum = rowIdx * fields.length + colIdx + 1;
            placeholders.push(`$${paramNum}`);
            values.push(row[fields[colIdx].name]);
          }
          valueClauses.push(`(${placeholders.join(", ")})`);
        }

        await target.query(
          `INSERT INTO "${table}" (${colNames}) VALUES ${valueClauses.join(", ")} ON CONFLICT DO NOTHING`,
          values,
        );
        inserted += batch.length;
      }

      totalRows += inserted;
      console.log(`  ✓ ${table} — ${inserted} rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If table doesn't exist in target, skip
      if (msg.includes("does not exist")) {
        console.log(`  ⚠ ${table} — not in target schema, skipping`);
      } else {
        console.error(`  ✗ ${table} — ${msg}`);
        errors.push(`${table}: ${msg}`);
      }
    }
  }

  // Re-enable FK checks
  await target.query("SET session_replication_role = 'origin';");

  // Reset sequences
  console.log("\nResetting sequences...");
  const { rows: seqs } = await target.query(`
    SELECT sequencename, 
           pg_get_serial_sequence_owner(sequencename) as tablename
    FROM pg_sequences 
    WHERE schemaname = 'public'
  `);
  
  // Alternative: reset via information_schema
  const { rows: serialCols } = await target.query(`
    SELECT table_name, column_name, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND column_default LIKE 'nextval%'
  `);
  
  for (const col of serialCols) {
    try {
      const seqMatch = col.column_default.match(/nextval\('([^']+)'/);
      if (!seqMatch) continue;
      const seqName = seqMatch[1];
      await target.query(`
        SELECT setval('${seqName}', COALESCE((SELECT MAX("${col.column_name}") FROM "${col.table_name}"), 0) + 1, false)
      `);
    } catch {
      // not all sequences need resetting (e.g. UUIDs)
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Migration complete: ${totalRows} rows across ${tableNames.length} tables`);
  if (errors.length) {
    console.log(`\n${errors.length} errors:`);
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  await source.end();
  await target.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
