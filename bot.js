const Parser = require("rss-parser");
const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");

const parser = new Parser();
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// ─── HISTORY (prevents repeat article+angle combos) ──────────────────────────
const HISTORY_FILE = path.join(__dirname, ".history.json");

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return []; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-50), null, 2));
}

// ─── RSS FEED SOURCES ────────────────────────────────────────────────────────
const RSS_FEEDS = [
  // ── Cyber / Intel ──────────────────────────────────────────────────────────
  "https://feeds.feedburner.com/TheHackersNews",               // The Hacker News
  "https://www.bellingcat.com/feed/",                          // Bellingcat OSINT

  // ── Defence / Military ─────────────────────────────────────────────────────
  "https://www.c4isrnet.com/arc/outboundfeeds/rss/",           // C4ISR Net
  "https://www.defenseone.com/rss/all/",                       // Defense One
  "https://warontherocks.com/feed/",                           // War on the Rocks

  // ── Geopolitics / Conflict ─────────────────────────────────────────────────
  "https://feeds.bbci.co.uk/news/world/rss.xml",              // BBC World News
  "https://www.theguardian.com/world/rss",                     // The Guardian World
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",    // NYT World
  "https://foreignpolicy.com/feed/",                           // Foreign Policy
  "https://www.spiegel.de/international/index.rss",            // Der Spiegel International
];

// Number of articles to pick per feed
const ARTICLES_PER_FEED = 2;

// ─── FETCH PRESS ─────────────────────────────────────────────────────────────
async function fetchArticles() {
  const articles = [];

  for (const url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items.slice(0, ARTICLES_PER_FEED);
      for (const item of items) {
        articles.push({
          title: item.title || "Untitled",
          summary: item.contentSnippet || item.content || "",
          link: item.link || "",
          source: feed.title || url,
          date: item.pubDate || "",
        });
      }
      console.log(`  ✓ Fetched ${items.length} articles from: ${feed.title || url}`);
    } catch (err) {
      console.error(`  ✗ Failed to fetch ${url}:`, err.message);
    }
  }

  return articles;
}

// ─── OPENAI API HELPER ───────────────────────────────────────────────────────
async function claudeCall(prompt, maxTokens = 1000) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

// ─── PICK MOST RELEVANT ARTICLE ───────────────────────────────────────────────
async function pickMostRelevant(articles) {
  const articleList = articles
    .map((a, i) => `[${i}] "${a.title}" (${a.source})\n${a.summary}`)
    .join("\n\n");

  const prompt = `You are an analyst for ARKEM — a unified intelligence platform. You are focused exclusively on the MDS (Multi-Domain Surveillance) ecosystem.

**MDS (Multi-Domain Surveillance):** Geospatial device tracking and visualisation (Discover Map / Kepler.gl, 50k+ device pins), pattern-of-life analysis, device movement tracing (Motion Tracer — movement paths, dwell time, co-traveller detection), L1-L3 network relationship mapping (Networks), autonomous pattern playback (Monitor Mode), geofence-based initiative targeting (Hydrogen), law enforcement and surveillance operations.

An article is relevant if it describes a real-world scenario where device tracking, geospatial surveillance, movement analysis, network relationship mapping, or geofence-based targeting would have changed the outcome or uncovered critical intelligence.

Below are this week's press articles:

${articleList}

Which 3 articles provide the strongest hooks for MDS use cases spanning Discover Map, Motion Tracer, Networks, Monitor Mode, or Hydrogen? Rank them best to worst.

Reply with ONLY 3 index numbers separated by commas (e.g. "3,0,7"). No explanation.`;

  const result = await claudeCall(prompt, 20);
  const indices = result.trim().split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0 && n < articles.length);

  if (indices.length === 0) {
    console.warn(`  ⚠ Could not parse article indices from Claude ("${result}"), defaulting to 0`);
    return articles[0];
  }

  // Pick the first candidate not in recent history, fallback to random
  const history = loadHistory();
  const usedLinks = new Set(history.map(h => h.link));
  const fresh = indices.find(i => !usedLinks.has(articles[i].link));
  const picked = fresh !== undefined ? fresh : indices[Math.floor(Math.random() * indices.length)];
  console.log(`  ✓ Top candidates: [${indices.join(", ")}] — selected [${picked}]: "${articles[picked].title}"`);
  return articles[picked];
}

// ─── OPERATIONAL ANGLES (rotated randomly for variety) ───────────────────────
const OPERATIONAL_ANGLES = [
  "a counter-terrorism unit tracking a suspected cell across multiple cities",
  "a law enforcement agency investigating an organised crime network's logistics routes",
  "a border security team monitoring cross-border movement of a high-value target",
  "a military intelligence team mapping the pattern-of-life of a threat actor near a critical installation",
  "a financial crimes unit tracing the physical movements of a money laundering suspect",
  "a protective intelligence team assessing threat actor proximity to a dignitary's schedule",
  "a counter-proliferation team tracking individuals suspected of transferring restricted materials",
];

// ─── GENERATE USE CASE VIA CLAUDE ────────────────────────────────────────────
async function generateUseCase(article) {
  const history = loadHistory();
  const usedAngles = new Set(history.filter(h => h.link === article.link).map(h => h.angle));
  const freshAngles = OPERATIONAL_ANGLES.filter(a => !usedAngles.has(a));
  const pool = freshAngles.length > 0 ? freshAngles : OPERATIONAL_ANGLES;
  const angle = pool[Math.floor(Math.random() * pool.length)];
  console.log(`  ✓ Operational angle: "${angle}"`);
  // Save this combo to history
  history.push({ link: article.link, angle, date: new Date().toISOString() });
  saveHistory(history);
  const prompt = `You are a senior product strategist for ARKEM Intelligence Platform — a geospatial device-tracking and intelligence analysis suite used by intelligence professionals.

You are focused exclusively on the MDS (Multi-Domain Surveillance) ecosystem. The MDS modules are:

- **Discover Map** — Kepler.gl-based geospatial canvas rendering 50k+ device pins in real time; analysts load device datasets, apply filters, and surface location clusters
- **Motion Tracer** — reconstructs individual device movement paths over time; reveals dwell locations, route patterns, and co-travellers (devices that move together)
- **Networks** — L1 (direct contacts), L2 (contacts of contacts), L3 (extended network) relationship graphs built from device and comms data
- **Monitor Mode** — autonomous playback of historical device patterns; detects recurring behaviours and anomalies without manual review
- **Hydrogen** — geofence-based initiative targeting; analysts draw zones and receive alerts or device lists when targets enter or exit

This week's most relevant press article is:

"${article.title}" (${article.source})
Link: ${article.link}
${article.summary}

Based on this article, generate ONE compelling, concrete MDS use case that chains at least 3 of the above modules together as a coordinated surveillance operation. Frame the scenario around *${angle}*. The use case must show how an analyst moves through the modules in sequence — the output of one step feeds the next.

Format your response exactly like this (use Slack mrkdwn: *bold* for bold, not **bold**):

Hey <!channel>, I just found out that
> [1-2 sentences summarising what the article actually reports — the real-world event, who is involved, and why it matters. Factual, no spin. Written as if Jack is briefing the team informally but precisely.]

*Inspired by:* <[article link]|[article title]> — [source]

*Scenario:*
[2-3 sentences describing a realistic operational scenario that mirrors what the press covers]

*Operational flow:*
[At least 3 numbered steps, each tied to a specific MDS module. Format each step as: "*MDS / [Module Name]* — [what the analyst does and what the module reveals or enables]". Steps must build on each other — output of one feeds the next.]

*Intelligence value:*
[1-2 sentences on the combined strategic or tactical outcome that only becomes possible by chaining these MDS modules together]

Keep it grounded and credible — written for an intelligence analyst or mission commander audience, not a sales deck.`;

  return await claudeCall(prompt, 1000);
}

// ─── POST TO SLACK ────────────────────────────────────────────────────────────
async function postToSlack(useCase, article) {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: useCase,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Jack Doe • ${new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
        },
      ],
    },
  ];

  await slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    text: "Hey @channel — Jack Doe has intel",
    blocks,
  });

  console.log(`  ✓ Posted to Slack channel: ${process.env.SLACK_CHANNEL_ID}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function generateAndPost() {
  try {
    console.log("  → Fetching RSS articles...");
    const articles = await fetchArticles();

    if (articles.length === 0) {
      console.error("  ✗ No articles fetched. Aborting.");
      return;
    }

    console.log(`  → Picking most relevant article from ${articles.length} candidates...`);
    const best = await pickMostRelevant(articles);

    console.log(`  → Generating use case from: "${best.title}"...`);
    const useCase = await generateUseCase(best);

    console.log("  → Posting to Slack...");
    await postToSlack(useCase, best);

    console.log("  ✓ Done.");
  } catch (err) {
    console.error("  ✗ Error in generateAndPost:", err);
  }
}

module.exports = { generateAndPost };
