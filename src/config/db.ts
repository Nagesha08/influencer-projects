import { Pool } from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined. Add it to backend/.env");
}

export const pool = new Pool({
  connectionString,
  max: 10,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query("SELECT 1");
}
