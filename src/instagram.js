import { CONFIG } from "./config.js";
import { clampText, parseInstagramMeta, toJpgUrl } from "./parse.js";
import { newPage } from "./browser.js";

export async function collectInstagramPosts(browser, knownIds = [], options = {}) {
  const details = options.details !== false;
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
          const out = [];
          const push = (u) => {
            if (u && u.includes("scontent") && !u.includes("s150x150") && !out.includes(u)) out.push(u);
          };
          push(m("og:image"));
          for (const i of document.querySelectorAll("article img, main img")) push(i.currentSrc || i.src);
          const v = document.querySelector("article video, main video");
          if (v) push(v.getAttribute("poster"));
          return {
            ogTitle: m("og:title"),
            ogDescription: m("og:description"),
            candidates: out,
          };
        });
        const parsed = parseInstagramMeta(meta.ogTitle, meta.ogDescription);

        // URL-urile imaginii sunt semnate de Instagram ("URL signature mismatch" la fetch),
        // deci o descarcam prin browser, cu cookie-urile de sesiune.
        let imageData = null;
        for (const cand of meta.candidates.slice(0, 3)) {
          try {
            const res = await page.goto(cand, { waitUntil: "load", timeout: 20000 });
            const ct = (res.headers()["content-type"] || "").toLowerCase();
            if (!/^image\/(jpeg|jpg|png|webp)/.test(ct)) continue;
            const buf = await res.buffer();
            if (buf && buf.length > 3000) {
              imageData = new Uint8Array(buf);
              break;
            }
          } catch (err) {
            console.error("instagram img fail", post.id, err && err.message);
          }
        }

        items.push({
          platform: "instagram",
          id: post.id,
          url: post.url,
          kind: post.kind,
          isReel: post.kind === "reel",
          caption: clampText(parsed.caption, 3500),
          title: clampText(parsed.caption.split("\n")[0] || "", 120),
          thumbnail: toJpgUrl(meta.candidates[0] || post.thumb),
          imageData,
          likes: parsed.likes,
          comments: parsed.comments,
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
