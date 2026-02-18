import { init, id } from "@instantdb/admin";
import schema from "../../../instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
});

// Use guest mode since we don't have an admin token
// This is safe for a single-user demo app
export const db = adminDb.asUser({ guest: true });

export { id };
