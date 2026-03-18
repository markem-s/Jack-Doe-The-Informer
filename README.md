# ARKEM Press Bot

Weekly Slack bot that reads intelligence/defence RSS feeds, generates an ARKEM-specific use case via Claude, and posts it to a Slack channel every Monday morning.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `SLACK_BOT_TOKEN` | Your Slack app's **Bot Token** (xoxb-...) |
| `SLACK_CHANNEL_ID` | Right-click channel in Slack → Copy link → last segment |

### 3. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. Choose **From scratch** → name it `ARKEM Press Bot`
3. Under **OAuth & Permissions** → add these **Bot Token Scopes**:
   - `chat:write`
   - `chat:write.public` (if posting to public channels)
4. **Install to workspace** → copy the `xoxb-` token into `.env`
5. Invite the bot to your channel: `/invite @arkem-press-bot`

---

## RSS Feeds

Edit the `RSS_FEEDS` array in `bot.js` to add or remove sources. Suggested feeds for the ARKEM domain:

```js
const RSS_FEEDS = [
  "https://feeds.feedburner.com/TheHackersNews",   // cyber/intel
  "https://www.bellingcat.com/feed/",               // OSINT
  "https://www.c4isrnet.com/arc/outboundfeeds/rss/", // C4ISR / defence
  "https://rss.janes.com/content/janes/all/news/en", // Jane's defence intel
  // add more...
];
```

---

## Run

### Start the bot (runs on cron)

```bash
node index.js
```

The bot runs **every Monday at 09:00** (server time). Keep the process alive with `pm2` or a system service.

### Test immediately (without waiting for cron)

Uncomment this line in `index.js`:

```js
// generateAndPost();
```

Then run `node index.js` once.

---

## Keep alive with PM2 (recommended)

```bash
npm install -g pm2
pm2 start index.js --name arkem-press-bot
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Project structure

```
arkem-press-bot/
├── index.js        # cron scheduler
├── bot.js          # RSS fetch → Claude → Slack
├── .env            # secrets (gitignored)
├── .env.example    # template
└── package.json
```

---

## Customising the use case prompt

The prompt is in `bot.js` → `generateUseCase()`. Edit it to:
- Shift focus to MDS vs Neon
- Target a specific customer vertical
- Change output length or format
- Add RASCLS / MICE framing requirements
