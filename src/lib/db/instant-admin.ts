import { init, id } from "@instantdb/admin";
import schema from "../../../instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || "",
  schema,
});

// Guest mode for existing API routes (no admin privileges needed)
export const db = adminDb.asUser({ guest: true });

// Full admin access for routes that need to query $users (e.g. webhook)
export const adminQuery = adminDb;

export { id };
