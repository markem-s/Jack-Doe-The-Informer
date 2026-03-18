require("dotenv").config();
const cron = require("node-cron");
const { App } = require("@slack/bolt");
const { generateAndPost } = require("./bot");

// ─── SLACK BOLT APP (Socket Mode) ────────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// /jack slash command — trigger a run on demand from Slack
app.command("/jack", async ({ ack, respond }) => {
  await ack();
  await respond("🛰 On it — fetching this week's most relevant article and generating use case...");
  await generateAndPost();
});

(async () => {
  await app.start();
  console.log("🛰  ARKEM Press Bot started (Socket Mode)");
  console.log("   Slash command: /jack");
  console.log("   Scheduled: every Thursday at 10:00 GMT");

  // Run every Thursday at 10:00
  cron.schedule("0 10 * * 4", async () => {
    console.log(`[${new Date().toISOString()}] Running weekly press digest...`);
    await generateAndPost();
  });
})();

// Uncomment to run immediately on start (useful for testing):
// generateAndPost();
