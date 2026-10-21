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

export async function postToDiscord(env, item) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL || CONFIG.discord.webhookUrl;
  const channelId = env.DISCORD_CHANNEL_ID || CONFIG.discord.channelId;
  const embed = buildEmbed(item);

  if (!webhookUrl && !channelId) throw new Error("lipseste DISCORD_CHANNEL_ID / DISCORD_WEBHOOK_URL");

  const endpoint = webhookUrl
    ? `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`
    : `${API}/channels/${channelId}/messages`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    throw new Error(`discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const msg = await res.json();
  return { ok: true, id: msg.id };
}
