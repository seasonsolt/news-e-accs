// Rewrites the official API prices (lb_prices kind='official') from a price file, by default the one in
// seeds. The scheduled refresh only fills in missing prices; run this after updating the file.
//   node --env-file=.env modules/leaderboard/scripts/import-leaderboard-prices.ts [prices.json]
import { closeDb } from "@aihot/backend/db";
import { importOfficialPrices } from "@aihot/leaderboard/backend/prices";

const { written, unknown } = await importOfficialPrices({ file: process.argv[2], overwrite: true });
console.log(`official prices ${written}`);
if (unknown.length) console.warn(`not on the leaderboard yet: ${unknown.join(", ")}`);
await closeDb();
