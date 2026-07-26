import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const whoizeCaptchaRecords = sqliteTable(
  "whoize_captcha_records",
  {
    recordKey: text("record_key").primaryKey(),
    value: text("value").notNull(),
    revision: integer("revision").notNull(),
    expiresAt: integer("expires_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);
