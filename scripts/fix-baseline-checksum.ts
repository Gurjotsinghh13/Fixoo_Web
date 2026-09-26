import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";

// The baseline migration was committed with a UTF-8 BOM, which Postgres rejects when
// `prisma migrate dev` replays it into the shadow database. The BOM has been removed,
// which changes the file's checksum. Databases that already recorded the baseline must
// have their stored checksum updated, or `prisma migrate dev` reports the migration as
// modified and offers to reset the schema.
//
// Dry run by default. Pass --apply to write.

const MIGRATION_NAME = "20260730000000_baseline_existing_database";
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const apply = process.argv.includes("--apply");

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const file = readFileSync(
    path.join(process.cwd(), "prisma", "migrations", MIGRATION_NAME, "migration.sql")
  );
  if (file.subarray(0, 3).equals(BOM)) {
    throw new Error("Baseline migration still starts with a BOM; pull the commit that removes it first.");
  }

  // Prisma checksums the file exactly as it is on disk, so the new checksum is taken
  // from this checkout. The old one may have been recorded from an LF or CRLF checkout.
  const text = file.toString("utf8");
  const lf = Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
  const crlf = Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8");
  const newChecksum = sha256(file);
  const oldChecksums = [sha256(Buffer.concat([BOM, lf])), sha256(Buffer.concat([BOM, crlf]))];

  const rows = await prisma.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum FROM _prisma_migrations WHERE migration_name = ${MIGRATION_NAME}
  `;
  if (rows.length === 0) {
    console.log(`${MIGRATION_NAME} is not recorded in this database; nothing to do.`);
    return;
  }
  if (rows.length > 1) {
    throw new Error(`${MIGRATION_NAME} is recorded ${rows.length} times; resolve manually.`);
  }

  const stored = rows[0].checksum;
  console.log(`stored checksum:  ${stored}`);
  console.log(`new checksum:     ${newChecksum}`);

  if (stored === newChecksum) {
    console.log("Already up to date; nothing to do.");
    return;
  }
  if (!oldChecksums.includes(stored)) {
    throw new Error(
      "Stored checksum does not match any known pre-fix version of the baseline. " +
        "The recorded migration differs from this repo's baseline; not changing it."
    );
  }

  if (!apply) {
    console.log("Stored checksum matches the pre-fix baseline. Re-run with --apply to update it.");
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE _prisma_migrations
    SET checksum = ${newChecksum}
    WHERE migration_name = ${MIGRATION_NAME} AND checksum = ${stored}
  `;
  if (updated !== 1) throw new Error(`Expected to update 1 row, updated ${updated}.`);
  console.log("Updated baseline checksum.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
