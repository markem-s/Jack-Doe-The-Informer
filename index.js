require("dotenv").config();
const cron = require("node-cron");
const { generateAndPost } = require("./bot");

console.log("🛰  ARKEM Press Bot started");
console.log(`Scheduled: every Thursday at 10:00 AM`);

// Run every Thursday at 10:00
cron.schedule("0 10 * * 4", async () => {
  console.log(`[${new Date().toISOString()}] Running weekly press digest...`);
  await generateAndPost();
});

// Uncomment to run immediately on start (useful for testing):
// generateAndPost();
