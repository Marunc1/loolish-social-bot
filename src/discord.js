import { CONFIG } from "./config.js";

const API = "https://discord.com/api/v10";

export function buildEmbed(item) {
  const isIg = item.platform === "instagram";
  const title = isIg
    ? item.isReel
      ? CONFIG.messages.newInstagramReel
      : CONFIG.messages.newInstagramPost
    : CONFIG.messages.newTikTokVideo;

  const embed = {
    title,
    url: item.url,
    color: isIg ? CONFIG.colors.instagram : CONFIG.colors.tiktok,
    description: item.caption || item.title || "",
    footer: { text: CONFIG.brand },
  };
  if (item.publishedAt) embed.timestamp = item.publishedAt;

  return embed;
}

function authHeaders(env) {
  const token = env.DISCORD_BOT_TOKEN;
  return token ? { authorization: `Bot ${token}` } : {};
}

// Secretul poate avea mai multe webhook-uri (separate prin virgula sau spatiu).
export function webhookUrls(env) {
  const raw = (env.DISCORD_WEBHOOK_URL || CONFIG.discord.webhookUrl || "").toString();
  const list = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("https://"));
  return [...new Set(list)];
}

export async function postToDiscord(env, item) {
  const mode = (CONFIG.discord.mode || "auto").toLowerCase();
  const hooks = mode === "bot" ? [] : webhookUrls(env);
  const channelId = env.DISCORD_CHANNEL_ID || CONFIG.discord.channelId;
  const token = env.DISCORD_BOT_TOKEN;
  const hasChannel = channelId && channelId !== "REPLACE_ME";
  // in modul "auto": webhook daca exista, altfel bot (niciodata amandoua)
  const useBot =
    mode === "bot" || (mode === "auto" && !hooks.length)
      ? Boolean(token) && hasChannel
      : false;
  const embed = buildEmbed(item);

  if (!hooks.length && !useBot) {
    throw new Error("lipseste DISCORD_CHANNEL_ID / DISCORD_WEBHOOK_URL");
  }

  // @everyone merge doar prin bot token - webhook-ul nu are voie sa sune @everyone
  const mention = useBot && CONFIG.discord.mentionEveryone;
  const payload = { embeds: [embed], allowed_mentions: { parse: ["everyone", "roles", "users"] } };
  if (mention) payload.content = "@everyone";

  const results = [];

  for (const hook of hooks) {
    const endpoint = `${hook}${hook.includes("?") ? "&" : "?"}wait=true`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...authHeaders(env), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const msg = await res.json();
    results.push({ ok: true, id: msg.id, via: "webhook" });
  }

  if (useBot) {
    const res = await fetch(`${API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { ...authHeaders(env), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const msg = await res.json();
    results.push({ ok: true, id: msg.id, via: "bot" });
  }

  if (!results.length) throw new Error("nu s-a trimis niciun mesaj");
  return { ok: true, id: results[0].id, sent: results.length, via: results.map((r) => r.via).join("+") };
}
