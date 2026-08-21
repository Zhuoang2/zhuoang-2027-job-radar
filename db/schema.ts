import { sql } from "drizzle-orm";
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    company: text("company").notNull(),
    role: text("role"),
    status: text("status").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "applications_status_check",
      sql`${table.status} IN ('applying', 'needs-review', 'submitted', 'paused')`,
    ),
  ],
);
