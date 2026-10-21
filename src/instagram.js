import puppeteer from "@cloudflare/puppeteer";
import { CONFIG } from "./config.js";
import { clampText, parseInstagramMeta } from "./parse.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function collectInstagramPosts(env, knownIds = []) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1400, height: 2000 });
    const profile = `https://www.instagram.com/${CONFIG.instagram.username}/`;
    await page.goto(profile, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page
      .waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 25000 })
      .catch(() => console.error("instagram: grid selector timeout"));

    const listed = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const href = a.getAttribute("href");
        if (!href) continue;
        const m = href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (!m) continue;
        if (out.some((x) => x.id === m[2])) continue;
        const img = a.querySelector("img");
        out.push({
          id: m[2],
          kind: m[1],
          url: new URL(href, location.origin).href,
          thumb: img ? img.currentSrc || img.src || "" : "",
          alt: img ? img.alt || "" : "",
        });
      }
      return out;
    });

    const known = new Set(knownIds);
    const fresh = listed.filter((p) => !known.has(p.id)).slice(0, CONFIG.instagram.maxDetailPages);

    const items = [];
    for (const post of fresh) {
      try {
        await page.goto(post.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page
          .waitForSelector('meta[property="og:description"]', { timeout: 15000 })
          .catch(() => console.error("instagram: og timeout", post.id));
        const meta = await page.evaluate(() => {
          const m = (p) => document.querySelector(`meta[property="${p}"]`)?.content || "";
          return {
            ogTitle: m("og:title"),
            ogDescription: m("og:description"),
            ogImage: m("og:image"),
          };
        });
        const parsed = parseInstagramMeta(meta.ogTitle, meta.ogDescription);
        items.push({
          platform: "instagram",
          id: post.id,
          url: post.url,
          kind: post.kind,
          isReel: post.kind === "reel",
          caption: clampText(parsed.caption, 3500),
          title: clampText(parsed.caption.split("\n")[0] || "", 120),
          thumbnail: meta.ogImage || post.thumb,
          likes: parsed.likes,
          comments: parsed.comments,
          publishedAt: parsed.publishedAt,
        });
      } catch (err) {
        console.error("instagram detail fail", post.id, err && err.message);
      }
    }

    return { items, total: listed.length, ids: listed.map((p) => p.id) };
  } finally {
    await browser.close().catch(() => {});
  }
}
