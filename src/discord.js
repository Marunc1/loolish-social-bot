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

  const fields = [];
  if (item.likes) fields.push({ name: "👍 Likes", value: String(item.likes), inline: true });
  if (item.comments) fields.push({ name: "💬 Comentarii", value: String(item.comments), inline: true });
  if (fields.length) embed.fields = fields;

  return embed;
}

function authHeaders(env) {
  const token = env.DISCORD_BOT_TOKEN;
  return token ? { authorization: `Bot ${token}` } : {};
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 1000) return null;
    return { bytes: buf, type };
  } catch {
    return null;
  }
}

export async function postToDiscord(env, item) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL || CONFIG.discord.webhookUrl;
  const channelId = env.DISCORD_CHANNEL_ID || CONFIG.discord.channelId;
  const embed = buildEmbed(item);

  const endpoint = webhookUrl
    ? `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`
    : `${API}/channels/${channelId}/messages`;

  if (!webhookUrl && !channelId) throw new Error("lipseste DISCORD_CHANNEL_ID / DISCORD_WEBHOOK_URL");

  const image = item.thumbnail ? await downloadImage(item.thumbnail) : null;

  if (image) {
    // trimitem imaginea in Discord si folosim URL-ul atasamentului
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ embeds: [embed] }));
    form.append(
      "files[0]",
      new Blob([image.bytes], { type: image.type }),
      `post.${(image.type.split("/")[1] || "jpg").split("+")[0]}`
    );
    const res = await fetch(endpoint, { method: "POST", headers: authHeaders(env), body: form });
    if (res.ok) {
      const msg = await res.json();
      const url = msg.attachments && msg.attachments[0] && msg.attachments[0].url;
      if (url) {
        embed.image = { url };
        const res2 = await fetch(endpoint, {
          method: "PATCH",
          headers: { ...authHeaders(env), "content-type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        });
        if (res2.ok) return { ok: true, id: msg.id };
      }
      return { ok: true, id: msg.id };
    }
    console.error("discord upload failed", res.status, (await res.text()).slice(0, 200));
  }

  if (item.thumbnail) embed.image = { url: item.thumbnail };
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

export async function postPlain(env, content) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL || CONFIG.discord.webhookUrl;
  const channelId = env.DISCORD_CHANNEL_ID || CONFIG.discord.channelId;
  const endpoint = webhookUrl
    ? `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}wait=true`
    : `${API}/channels/${channelId}/messages`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { ...authHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
