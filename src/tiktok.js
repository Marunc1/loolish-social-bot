import { CONFIG } from "./config.js";
import { tagText, splitItems, clampText } from "./parse.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function fetchTikTokPosts(env) {
  // 2 runde: multe instante RSSHub sunt instabile (503/530/429)
  for (let round = 0; round < 2; round++) {
    for (const base of CONFIG.tiktok.rssInstances) {
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
    if (round === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return { source: null, items: [] };
}

function parseItem(item) {
  const link = tagText(item, "link");
  const id = (link.match(/\/video\/(\d+)/) || [])[1] || "";
  if (!id) return null;
  const pubDate = tagText(item, "pubDate");
  let publishedAt = null;
  if (pubDate) {
    const t = Date.parse(pubDate);
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
  }
  const caption = clampText(tagText(item, "title"), 3500);
  return {
    platform: "tiktok",
    id,
    url: link,
    title: clampText(tagText(item, "title"), 300),
    caption,
    publishedAt,
    isReel: true,
  };
}
