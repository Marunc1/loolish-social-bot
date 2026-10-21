import { CONFIG } from "./config.js";
import { collectInstagramPosts } from "./instagram.js";
import { fetchTikTokPosts } from "./tiktok.js";
import { postToDiscord } from "./discord.js";
import { withBrowser } from "./browser.js";

const STATE_KEY = "state:seen";
const RUN_KEY = "state:lastRun";

export default {
  async scheduled(event, env, ctx) {
    try {
      await tick(env);
    } catch (err) {
      console.error("scheduled:", err && err.message);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/status") return json(await status(env));
    if (url.pathname === "/run" && debugAllowed(env)) {
      await tick(env);
      return json(await status(env));
    }
    if (url.pathname === "/probe" && debugAllowed(env)) {
      const target = url.searchParams.get("url");
      try {
        const res = await fetch(target, {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36" },
          signal: AbortSignal.timeout(25000),
        });
        const text = await res.text();
        return json({ status: res.status, len: text.length, head: text.slice(0, 1200) });
      } catch (err) {
        return json({ error: String(err && err.message) });
      }
    }
    if (url.pathname === "/test" && debugAllowed(env)) {
      const sample = {
        platform: url.searchParams.get("platform") || "instagram",
        id: "test-1",
        url: "https://www.instagram.com/loolishgaming/",
        isReel: url.searchParams.get("reel") === "1",
        caption:
          "Test Loolish Social Bot.\n\nAcesta e un mesaj de test - arată cum arată anunțul cu imagine, caption, like-uri și link.",
        title: "Test",
        likes: 42,
        comments: 7,
        publishedAt: new Date().toISOString(),
      };
      try {
        const res = await postToDiscord(env, sample);
        return json({ ok: true, ...res });
      } catch (err) {
        return json({ ok: false, error: String(err && err.message) }, { status: 500 });
      }
    }
    return new Response("Loolish social bot activ.", { status: 200 });
  },
};

function debugAllowed(env) {
  return env && env.ALLOW_DEBUG === "1";
}

async function loadState(kv) {
  const raw = await kv.get(STATE_KEY, "text");
  if (!raw) return { seen: {} };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { seen: {} };
  } catch {
    return { seen: {} };
  }
}

async function saveState(kv, state) {
  const entries = Object.entries(state.seen || {});
  entries.sort((a, b) => (a[1] || 0) - (b[1] || 0));
  state.seen = Object.fromEntries(entries.slice(-CONFIG.poll.keepSeen));
  await kv.put(STATE_KEY, JSON.stringify(state));
}

function knownIds(state, platform) {
  const prefix = platform + ":";
  return Object.keys(state.seen || {})
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

async function tick(env) {
  const kv = env.SOCIAL_KV;
  const state = await loadState(kv);
  const now = Date.now();
  const report = { at: new Date(now).toISOString(), announced: [], errors: [] };

  // ---- 1. TikTok: lista de video-uri din RSS (fara browser) ----
  let ttItems = [];
  if (CONFIG.tiktok.enabled) {
    try {
      const { source, items } = await fetchTikTokPosts(env);
      report.tiktok = { source, found: items.length };
      ttItems = items;
      if (!items.length) report.errors.push("tiktok: feed gol");
    } catch (err) {
      report.errors.push(`tiktok: ${err && err.message}`);
    }
  }

  const ttKnown = knownIds(state, "tiktok");
  const ttFresh = ttItems.filter((it) => !ttKnown.includes(it.id));
  const ttFirstRun = ttKnown.length === 0;

  const igKnown = knownIds(state, "instagram");
  const igFirstRun = igKnown.length === 0;

  // ---- 2. Browser: doar Instagram (TikTok vine complet din RSS) ----
  let igResult = { items: [], total: 0, ids: [] };
  try {
    await withBrowser(env, async (browser) => {
      if (CONFIG.instagram.enabled) {
        igResult = await collectInstagramPosts(browser, igKnown, { details: !igFirstRun });
      }
    });
  } catch (err) {
    report.errors.push(`browser: ${err && err.message}`);
  }

  // ---- 3. Anunturi TikTok ----
  if (CONFIG.tiktok.enabled && ttItems.length) {
    if (ttFirstRun) {
      for (const it of ttItems) state.seen[`tiktok:${it.id}`] = now;
      report.tiktok.bootstrapped = true;
    } else if (ttFresh.length) {
      for (const it of ttFresh.slice(0, CONFIG.poll.maxAnnouncePerRun)) {
        try {
          const res = await postToDiscord(env, it);
          state.seen[`tiktok:${it.id}`] = now;
          report.announced.push(`tiktok:${it.id} (msg ${res.id})`);
        } catch (err) {
          report.errors.push(`tiktok post ${it.id}: ${err && err.message}`);
        }
      }
    }
  }

  // ---- 4. Anunturi Instagram ----
  if (CONFIG.instagram.enabled) {
    report.instagram = { found: igResult.ids.length, new: igResult.items.length };
    if (!igResult.ids.length) {
      report.errors.push("instagram: profil gol (posibil blocat sau fara browser time)");
    } else if (igFirstRun) {
      for (const id of igResult.ids) state.seen[`instagram:${id}`] = now;
      report.instagram.bootstrapped = true;
    } else {
      for (const it of igResult.items.slice(0, CONFIG.poll.maxAnnouncePerRun)) {
        try {
          const res = await postToDiscord(env, it);
          state.seen[`instagram:${it.id}`] = now;
          report.announced.push(`instagram:${it.id} (msg ${res.id})`);
        } catch (err) {
          report.errors.push(`instagram post ${it.id}: ${err && err.message}`);
        }
      }
    }
  }

  await saveState(kv, state);
  await kv.put(RUN_KEY, JSON.stringify(report));
  console.log("run:", JSON.stringify(report));
  return report;
}

async function status(env) {
  const kv = env.SOCIAL_KV;
  const state = await loadState(kv);
  const lastRun = await kv.get(RUN_KEY, "text");
  return {
    brand: CONFIG.brand,
    platforms: {
      instagram: { username: CONFIG.instagram.username, seen: knownIds(state, "instagram").length },
      tiktok: { username: CONFIG.tiktok.username, seen: knownIds(state, "tiktok").length },
    },
    lastRun: lastRun ? JSON.parse(lastRun) : null,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
