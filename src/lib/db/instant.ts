import { init, id } from "@instantdb/react";
import schema from "../../../instant.schema";

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
});

export { id };
export type { AppSchema } from "../../../instant.schema";
