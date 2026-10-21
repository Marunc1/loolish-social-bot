import { CONFIG } from "./config.js";
import { collectInstagramPosts } from "./instagram.js";
import { fetchTikTokPosts } from "./tiktok.js";
import { postToDiscord, postPlain } from "./discord.js";

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
  const keep = entries.slice(-CONFIG.poll.keepSeen);
  state.seen = Object.fromEntries(keep);
  await kv.put(STATE_KEY, JSON.stringify(state));
}

function isSeen(state, key) {
  return Boolean(state.seen && state.seen[key]);
}

function platformSeenCount(state, platform) {
  return Object.keys(state.seen || {}).filter((k) => k.startsWith(platform + ":")).length;
}

async function tick(env) {
  const kv = env.SOCIAL_KV;
  const state = await loadState(kv);
  const now = Date.now();
  const report = { at: new Date(now).toISOString(), announced: [], errors: [] };

  // ---- TikTok (RSS, fara browser) ----
  if (CONFIG.tiktok.enabled) {
    try {
      const { source, items } = await fetchTikTokPosts(env);
      report.tiktok = { source, found: items.length };
      if (!items.length) {
        report.errors.push("tiktok: feed gol");
      } else {
        const fresh = items.filter((it) => !isSeen(state, `tiktok:${it.id}`));
        const firstRun = platformSeenCount(state, "tiktok") === 0;
        if (firstRun) {
          for (const it of items) state.seen[`tiktok:${it.id}`] = now;
          report.tiktok.bootstrapped = true;
        } else if (fresh.length) {
          for (const it of fresh.slice(0, CONFIG.poll.maxAnnouncePerRun)) {
            try {
              await postToDiscord(env, it);
              state.seen[`tiktok:${it.id}`] = now;
              report.announced.push(`tiktok:${it.id}`);
            } catch (err) {
              report.errors.push(`tiktok post ${it.id}: ${err && err.message}`);
            }
          }
        }
      }
    } catch (err) {
      report.errors.push(`tiktok: ${err && err.message}`);
    }
  }

  // ---- Instagram (Browser Run) ----
  if (CONFIG.instagram.enabled) {
    const known = Object.keys(state.seen || {})
      .filter((k) => k.startsWith("instagram:"))
      .map((k) => k.slice("instagram:".length));
    try {
      const { items, ids } = await collectInstagramPosts(env, known);
      report.instagram = { found: ids.length, new: items.length };
      if (!ids.length) {
        report.errors.push("instagram: profil gol (posibil blocat sau fara browser time)");
      } else {
        const firstRun = platformSeenCount(state, "instagram") === 0;
        if (firstRun) {
          for (const id of ids) state.seen[`instagram:${id}`] = now;
          report.instagram.bootstrapped = true;
        } else {
          for (const it of items.slice(0, CONFIG.poll.maxAnnouncePerRun)) {
            try {
              await postToDiscord(env, it);
              state.seen[`instagram:${it.id}`] = now;
              report.announced.push(`instagram:${it.id}`);
            } catch (err) {
              report.errors.push(`instagram post ${it.id}: ${err && err.message}`);
            }
          }
        }
      }
    } catch (err) {
      report.errors.push(`instagram: ${err && err.message}`);
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
      instagram: { username: CONFIG.instagram.username, seen: platformSeenCount(state, "instagram") },
      tiktok: { username: CONFIG.tiktok.username, seen: platformSeenCount(state, "tiktok") },
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
