import { createHash, randomBytes } from "node:crypto";
import { sql, type Db } from "@aihot/backend/db";
import { NewsletterRejected } from "@aihot/backend/newsletter/subscribe";

export const SIGNUP_CREDITS = 100;
export const WALLPAPER_PRICE = 10;
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export async function issueKey(subscriberId: number, db: Db = sql) {
  const key = randomBytes(24).toString("base64url");
  const [row] = await db<{ credits: number }[]>`
    INSERT INTO wallpaper_keys (subscriber_id, key_hash, credits, granted)
    VALUES (${subscriberId}, ${hashKey(key)}, ${SIGNUP_CREDITS}, ${SIGNUP_CREDITS})
    ON CONFLICT (subscriber_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, updated_at = now()
    RETURNING credits`;
  return { key, credits: row!.credits };
}
export async function keyOwner(key: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(key)) throw new NewsletterRejected(401, "unauthorized", "Invalid wallpaper key.");
  const [row] = await sql<{ subscriber_id: number; credits: number; granted: number; active: boolean }[]>`
    SELECT k.subscriber_id, k.credits, k.granted, (s.status = 'confirmed' AND s.unsubscribed_at IS NULL) AS active
    FROM wallpaper_keys k JOIN newsletter_subscribers s ON s.id = k.subscriber_id WHERE key_hash = ${hashKey(key)}`;
  if (!row) throw new NewsletterRejected(401, "unauthorized", "Invalid wallpaper key.");
  if (!row.active) throw new NewsletterRejected(403, "forbidden", "An active subscription is required.");
  return row;
}
export async function charge(subscriberId: number, wallpaperId: number) {
  await sql.begin(async (tx) => {
    const inserted = await tx`INSERT INTO wallpaper_downloads (subscriber_id, wallpaper_id)
      VALUES (${subscriberId}, ${wallpaperId}) ON CONFLICT DO NOTHING RETURNING 1`;
    if (!inserted.length) return;
    const paid = await tx`UPDATE wallpaper_keys SET credits = credits - ${WALLPAPER_PRICE}, updated_at = now()
      WHERE subscriber_id = ${subscriberId} AND credits >= ${WALLPAPER_PRICE} RETURNING credits`;
    if (!paid.length) throw new NewsletterRejected(402, "out_of_credits", "Your wallpaper credits have been used up.");
  });
}
