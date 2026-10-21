import { CONFIG } from "./config.js";
import { tagText, splitItems, clampText } from "./parse.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function fetchTikTokPosts(env) {  for (const base of CONFIG.tiktok.rssInstances) {
    const url = `${base}/tiktok/user/@${CONFIG.tiktok.username}`;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/rss+xml,text/xml,*/*" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.error("tiktok rss http", base, res.status);
        continue;
      }
      const xml = await res.text();
      if (!/<item[\s>]/.test(xml)) {
        console.error("tiktok rss empty", base);
        continue;
      }
      const items = splitItems(xml).map(parseItem).filter((x) => x && x.id);
      if (items.length) return { source: base, items };
    } catch (err) {
      console.error("tiktok rss fail", base, err && err.message);
    }
  }
  return { source: null, items: [] };
}

function parseItem(item) {
  const link = tagText(item, "link");
  const id = (link.match(/\/video\/(\d+)/) || [])[1] || "";
  if (!id) return null;
  const description = tagText(item, "description");
  const thumbnail = (description.match(/poster="([^"]+)"/) || [])[1] || "";
  const videoUrl = (description.match(/<source src="([^"]+)"/) || [])[1] || "";
  const pubDate = tagText(item, "pubDate");
  let publishedAt = null;
  if (pubDate) {
    const t = Date.parse(pubDate);
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
  }
  return {
    platform: "tiktok",
    id,
    url: link,
    title: clampText(tagText(item, "title"), 300),
    caption: clampText(tagText(item, "title"), 3500),
    thumbnail,
    videoUrl,
    publishedAt,
    isReel: true,
  };
}
