import pg from "pg";

const url = "postgresql://postgres.xrxbdftqiinnnifxzruz:XJnzQkUxhDbwXPwCKuJDfrXwtQUAusJr@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";

async function verify() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();

  const { rows } = await c.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('__drizzle_migrations','spatial_ref_sys') ORDER BY tablename`
  );

  let total = 0;
  for (const t of rows) {
    const { rows: cnt } = await c.query(`SELECT COUNT(*)::int as c FROM "${t.tablename}"`);
    if (cnt[0].c > 0) {
      console.log(`  ${t.tablename}: ${cnt[0].c}`);
      total += cnt[0].c;
    }
  }
  console.log(`\nTotal: ${total} rows`);
  await c.end();
}

verify().catch(console.error);
