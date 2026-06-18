import { backfillTrafficForDataDate } from "../src/snapshots/capture-traffic.js";

function usage(): never {
  console.error("Usage: npm run backfill:traffic -- <start-date> [end-date] [--domain=dnamusic.edu.co]");
  console.error("Example: npm run backfill:traffic -- 2026-04-01 2026-06-18 --domain=dnamusic.edu.co");
  process.exit(1);
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDays(date: string, days: number): string {
  const current = new Date(`${date}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const start = args.find((arg) => !arg.startsWith("--"));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const end = positional[1] ?? start;
  const domainArg = args.find((arg) => arg.startsWith("--domain="));
  const domain = domainArg ? domainArg.slice("--domain=".length).trim() : undefined;
  if (!isIsoDate(start) || !isIsoDate(end)) usage();
  if (start > end) {
    console.error("Start date must be <= end date");
    process.exit(1);
  }

  let cursor = start;
  let totalOk = 0;
  let totalFailed = 0;
  const allErrors: Array<{ date: string; domain: string; source: string; error: string }> = [];

  while (cursor <= end) {
    console.log(`Backfilling traffic data date ${cursor}${domain ? ` for ${domain}` : ""}...`);
    const result = await backfillTrafficForDataDate(cursor, domain);
    totalOk += result.ok;
    totalFailed += result.failed;
    for (const error of result.errors) allErrors.push({ date: cursor, ...error });
    cursor = addDays(cursor, 1);
  }

  console.log(JSON.stringify({
    start,
    end,
    domain: domain ?? null,
    total_ok: totalOk,
    total_failed: totalFailed,
    errors: allErrors,
  }, null, 2));

  if (allErrors.length > 0) process.exitCode = 1;
}

await main();
