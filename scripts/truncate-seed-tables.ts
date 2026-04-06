import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL!);

async function reset() {
  await db.execute(
    sql.raw(`TRUNCATE TABLE
      wallet_transaction, wallet, "order_item", "order",
      book_issuance, book_copy, book, menu_item, child,
      organization_device, organization_membership, session,
      account, "user", canteen, library, organization
      CASCADE`)
  );
  console.log("Tables truncated");
  process.exit(0);
}

reset();
