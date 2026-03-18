const Parser = require("rss-parser");
const { WebClient } = require("@slack/web-api");

const parser = new Parser();
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// ─── RSS FEED SOURCES ────────────────────────────────────────────────────────
// Add or remove feeds relevant to your intelligence/geospatial/OSInt domain
const RSS_FEEDS = [
  "https://feeds.feedburner.com/TheHackersNews",               // cyber/intel
  "https://www.bellingcat.com/feed/",                          // OSINT investigations
  "https://www.c4isrnet.com/arc/outboundfeeds/rss/",           // C4ISR / defence
  "https://rss.janes.com/content/janes/all/news/en",           // Jane's defence
  "https://feeds.feedburner.com/SettlersOfCatan",              // placeholder - replace
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

// ─── CLAUDE API HELPER ───────────────────────────────────────────────────────
async function claudeCall(prompt, maxTokens = 1000) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.content.find((b) => b.type === "text")?.text || "";
}

// ─── PICK MOST RELEVANT ARTICLE ───────────────────────────────────────────────
async function pickMostRelevant(articles) {
  const articleList = articles
    .map((a, i) => `[${i}] "${a.title}" (${a.source})\n${a.summary}`)
    .join("\n\n");

  const prompt = `You are an analyst for ARKEM — a unified intelligence platform organised into three ecosystems:

**MDS (Multi-Domain Surveillance):** Geospatial device tracking and visualisation (Kepler.gl), pattern-of-life analysis, device movement tracing (Motion Tracer), L1-L3 network relationship mapping, temporal investigation, real-time device pin rendering (50k+ pins/day), law enforcement and surveillance operations.

**SSE (Scaled Social Engineering):** AI-powered alias persona management (Neon), outbound/inbound HUMINT missions, multi-channel engagement (WhatsApp, Telegram), target behavioural profiling, RASCLS governance, undercover operations, social network infiltration, information elicitation, influence operations.

**UCC (Unconventional Cyber Capabilities):** Mobile app vulnerability scanning (Nitrogen/Jenkins/BeVigil), offensive cyber operations, threat actor app analysis, supply chain security, exploit research.

**Cross-pillar modules in development:**
- Carbon: Physical intelligence collection, field-sourced artifact acquisition
- Crow: Narrative and social media intelligence, sentiment monitoring, influence tracking
- Gravel: Signal intelligence, radio spectrum monitoring, communication network detection

An article is relevant if it describes a real-world scenario that exposes a capability gap or operational challenge that any of the above ecosystems or modules directly addresses — i.e. a situation where device tracking, AI alias operations, app vulnerabilities, physical intelligence, narrative monitoring, or signal intelligence would have changed the outcome.

Below are this week's press articles:

${articleList}

Which single article provides the strongest hook for an ARKEM use case across MDS, SSE, UCC, or cross-pillar modules?

Reply with ONLY the index number (e.g. "3"). No explanation.`;

  const result = await claudeCall(prompt, 10);
  const index = parseInt(result.trim(), 10);

  if (isNaN(index) || index < 0 || index >= articles.length) {
    console.warn(`  ⚠ Could not parse article index from Claude ("${result}"), defaulting to 0`);
    return articles[0];
  }

  console.log(`  ✓ Most relevant article [${index}]: "${articles[index].title}"`);
  return articles[index];
}

// ─── GENERATE USE CASE VIA CLAUDE ────────────────────────────────────────────
async function generateUseCase(article) {
  const prompt = `You are a senior product strategist for ARKEM Intelligence Platform — a geospatial device-tracking and intelligence analysis suite used by intelligence professionals.

ARKEM is a unified intelligence platform with three ecosystems and a shared AI layer:

**MDS (Multi-Domain Surveillance):** Discover Map (Kepler.gl, 50k+ device pins), Motion Tracer (movement paths, dwell time, co-traveller detection), Networks (L1-L3 relationship graphs), Monitor Mode (autonomous pattern playback), Hydrogen (geofence-based initiative targeting).

**SSE (Scaled Social Engineering):** Neon (mission workspace, AI alias personas, outbound/inbound HUMINT, RASCLS governance, objective activation workflow, multi-channel: WhatsApp/Telegram), Arkimedes AI (mission planning, alias development, target behavioural analysis).

**UCC (Unconventional Cyber Capabilities):** Nitrogen (app scanning via Jenkins/BeVigil, vulnerability enumeration), Hydrogen (cyber initiative coordination), Magnesium (supplier marketplace for tools and exploits).

**Cross-pillar modules in development:**
- Carbon: Physical intelligence collection, field artifact acquisition, map-based task definition
- Crow: Narrative/social media intelligence, sentiment monitoring, influence propagation tracking
- Gravel: Signal intelligence, radio spectrum monitoring, communication network detection

This week's most relevant press article is:

"${article.title}" (${article.source})
${article.summary}

Based on this article, generate ONE compelling, concrete use case that spans at least 3 ARKEM modules working together as a coordinated operation. The use case should show how an analyst would move through multiple modules in sequence — not use them in isolation.

Format your response exactly like this:

## 🛰 Weekly ARKEM Use Case

**Inspired by:** [article title and source]

**Scenario:**
[2-3 sentences describing a realistic operational scenario that mirrors what the press covers]

**Operational flow:**
[At least 3 numbered steps, each tied to a specific module. Format each step as: "**[Ecosystem / Module]** — [what the analyst does and what the module reveals or enables]". Steps should build on each other logically — the output of one feeds the next.]

**Intelligence value:**
[1-2 sentences on the combined strategic or tactical outcome that only becomes possible by connecting these modules together]

Keep it grounded and credible — written for an intelligence analyst or mission commander audience, not a sales deck.`;

  return await claudeCall(prompt, 1000);
}

// ─── POST TO SLACK ────────────────────────────────────────────────────────────
async function postToSlack(useCase, article) {
  const sourceLinks = `• <${article.link}|${article.title}> — ${article.source}`;

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: useCase,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Source article:*\n${sourceLinks}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Generated by ARKEM Press Bot • ${new Date().toLocaleDateString("en-GB", {
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
    text: "🛰 Weekly ARKEM Use Case — from this week's press",
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
