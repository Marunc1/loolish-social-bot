import { CONFIG } from "./config.js";
import { clampText, parseInstagramMeta } from "./parse.js";
import { newPage } from "./browser.js";

export async function collectInstagramPosts(browser, knownIds = [], options = {}) {
  const details = options.details !== false;
  // 2 incercari: uneori profilul intra in login wall sau rate-limit temporar
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await collectOnce(browser, knownIds, details);
    if (res.total || attempt === 1) return res;
    console.error("instagram: profil gol, reiau dupa 20s");
    await new Promise((r) => setTimeout(r, 20000));
  }
}

async function collectOnce(browser, knownIds, details) {
  const page = await newPage(browser);
  try {
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
        out.push({
          id: m[2],
          kind: m[1],
          url: new URL(href, location.origin).href,
        });
      }
      return out;
    });

    const known = new Set(knownIds);
    const fresh = details
      ? listed.filter((p) => !known.has(p.id)).slice(0, CONFIG.instagram.maxDetailPages)
      : [];

    let diagnostic = null;
    if (!listed.length) {
      diagnostic = await page
        .evaluate(() => ({
          title: document.title,
          url: location.href,
          body: (document.body ? document.body.innerText : "").slice(0, 300),
          links: document.querySelectorAll("a").length,
        }))
        .catch(() => null);
      console.error("instagram: grid gol", JSON.stringify(diagnostic));
    }

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
          publishedAt: parsed.publishedAt,
        });
      } catch (err) {
        console.error("instagram detail fail", post.id, err && err.message);
      }
    }

    return { items, total: listed.length, ids: listed.map((p) => p.id), diagnostic };
  } finally {
    await page.close().catch(() => {});
  }
}
