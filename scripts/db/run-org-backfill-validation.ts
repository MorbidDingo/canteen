import "dotenv/config";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const nullCheckSql = `
      SELECT 'child' AS table_name, COUNT(*) AS null_org_rows
      FROM child
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'temporary_rfid_access', COUNT(*)
      FROM temporary_rfid_access
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'menu_item', COUNT(*)
      FROM menu_item
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'audit_log', COUNT(*)
      FROM audit_log
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'book', COUNT(*)
      FROM book
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'book_copy', COUNT(*)
      FROM book_copy
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'bulk_photo_upload', COUNT(*)
      FROM bulk_photo_upload
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'library_setting', COUNT(*)
      FROM library_setting
      WHERE organization_id IS NULL
      UNION ALL
      SELECT 'app_setting', COUNT(*)
      FROM app_setting
      WHERE organization_id IS NULL
    `;

    const duplicateChecks: Array<{ label: string; sql: string }> = [
      {
        label: "child.gr_number duplicates",
        sql: `
          SELECT organization_id, gr_number, COUNT(*) AS cnt
          FROM child
          WHERE gr_number IS NOT NULL
          GROUP BY organization_id, gr_number
          HAVING COUNT(*) > 1
        `,
      },
      {
        label: "child.rfid_card_id duplicates",
        sql: `
          SELECT organization_id, rfid_card_id, COUNT(*) AS cnt
          FROM child
          WHERE rfid_card_id IS NOT NULL
          GROUP BY organization_id, rfid_card_id
          HAVING COUNT(*) > 1
        `,
      },
      {
        label: "temporary_rfid_access.temporary_rfid_card_id duplicates",
        sql: `
          SELECT organization_id, temporary_rfid_card_id, COUNT(*) AS cnt
          FROM temporary_rfid_access
          WHERE temporary_rfid_card_id IS NOT NULL
          GROUP BY organization_id, temporary_rfid_card_id
          HAVING COUNT(*) > 1
        `,
      },
      {
        label: "book_copy.accession_number duplicates",
        sql: `
          SELECT organization_id, accession_number, COUNT(*) AS cnt
          FROM book_copy
          WHERE accession_number IS NOT NULL
          GROUP BY organization_id, accession_number
          HAVING COUNT(*) > 1
        `,
      },
    ];

    const missingMembershipSql = `
      SELECT COUNT(*)::int AS missing_membership_count
      FROM "user" u
      LEFT JOIN organization_membership om
        ON om.user_id = u.id
       AND om.status = 'ACTIVE'
      WHERE om.id IS NULL
    `;

    const legacyConstraintCheckSql = `
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'child_gr_number_unique',
        'child_rfid_card_id_unique',
        'temporary_rfid_access_temporary_rfid_card_id_unique',
        'book_copy_accession_number_unique'
      )
      ORDER BY conname
    `;

    const nullRes = await client.query(nullCheckSql);
    console.log("Null organization_id counts:");
    console.table(nullRes.rows);

    for (const check of duplicateChecks) {
      const result = await client.query(check.sql);
      console.log(`${check.label}: ${result.rowCount} row(s)`);
    }

    const missingRes = await client.query(missingMembershipSql);
    console.log(`Users without active membership: ${missingRes.rows[0].missing_membership_count}`);

    const legacyConstraintRes = await client.query(legacyConstraintCheckSql);
    const remainingLegacyConstraintCount = legacyConstraintRes.rowCount ?? 0;
    console.log(`Remaining legacy global unique constraints: ${remainingLegacyConstraintCount}`);
    if (remainingLegacyConstraintCount > 0) {
      console.table(legacyConstraintRes.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Validation run failed:", error);
  process.exit(1);
});
