import "dotenv/config";
import { pool } from "./config/db.js";
import { verifyFirebaseToken } from "./config/firebase.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 4000);
const app = createApp(pool, verifyFirebaseToken);

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
