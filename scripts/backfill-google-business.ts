import { backfillGoogleBusinessFromZernio } from "../src/google-business-store.js";

const snapshotDate = process.argv[2];
const maxReviewsPerLocation = Number(process.argv[3] ?? "100");

async function main() {
  const result = await backfillGoogleBusinessFromZernio({
    snapshotDate,
    maxReviewsPerLocation: Number.isFinite(maxReviewsPerLocation) && maxReviewsPerLocation > 0 ? maxReviewsPerLocation : 100,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
