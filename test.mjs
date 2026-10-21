import assert from "node:assert/strict";
import { decodeEntities, stripCdata, tagText, splitItems, clampText, parseInstagramMeta, toJpgUrl } from "./src/parse.js";

// --- entitati ---
assert.equal(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;"), `a & b <c> "d" 'e'`);
assert.equal(decodeEntities("&copy; &#169;"), "&copy; ©");

// --- CDATA ---
assert.equal(stripCdata("<![CDATA[Salut lume]]>"), "Salut lume");
assert.equal(tagText("<rss><title><![CDATA[Post nou]]></title></rss>", "title"), "Post nou");
assert.equal(tagText("<rss></rss>", "title"), "");

// --- itemuri RSS ---
const xml = `<rss><channel>
<item><title><![CDATA[Acum te poți juca! #loolish]]></title>
<link>https://www.tiktok.com/@loolishgaming/video/7698812631938862369</link>
<description>&lt;video poster=&quot;https://p16.tiktokcdn.com/x.image&quot;&gt;&lt;source src=&quot;https://v45.tiktokcdn.com/v.mp4&quot;&gt;&lt;/video&gt;</description>
<pubDate>Tue, 20 Oct 2026 18:05:00 GMT</pubDate></item>
<item><title>Al doilea</title><link>https://www.tiktok.com/@loolishgaming/video/7698411448170482977</link><pubDate>Mon, 19 Oct 2026 16:08:12 GMT</pubDate></item>
</channel></rss>`;
const items = splitItems(xml);
assert.equal(items.length, 2);
assert.equal(tagText(items[0], "title"), "Acum te poți juca! #loolish");
assert.equal(tagText(items[0], "link"), "https://www.tiktok.com/@loolishgaming/video/7698812631938862369");
assert.equal(Date.parse(tagText(items[0], "pubDate")), Date.UTC(2026, 9, 20, 18, 5, 0));

const desc = tagText(items[0], "description");
assert.ok(desc.includes('poster="https://p16.tiktokcdn.com/x.image"'), "poster extras");
assert.ok(desc.includes('src="https://v45.tiktokcdn.com/v.mp4"'), "video src extras");

// --- meta Instagram ---
const ogTitle = 'Loolish Gaming on Instagram: "Sâmbăta asta schimbăm jocul! #LoolishClash"';
const ogDesc =
  '53 likes, 6 comments - loolishgaming on October 17, 2026: "Sâmbăta asta schimbăm jocul! #LoolishClash". ';
const meta = parseInstagramMeta(ogTitle, ogDesc);
assert.equal(meta.caption, "Sâmbăta asta schimbăm jocul! #LoolishClash");
assert.equal(meta.likes, 53);
assert.equal(meta.comments, 6);
assert.equal(meta.dateText, "October 17, 2026");
assert.ok(meta.publishedAt, "publishedAt parsat");

// --- clamp ---
assert.equal(clampText("abc", 10), "abc");
assert.equal(clampText("abcdefghij", 5).length, 5);

// --- heic -> jpg (Instagram) ---
const heic =
  "https://scontent-fra3-1.cdninstagram.com/v/t51.82787-15/abc_n.heic?stp=c288.0.864.864a&_nc_ht=x&oe=123";
const jpg = toJpgUrl(heic);
assert.ok(jpg.includes("stp=dst-jpg_e35_tt6"), "stp convertit in jpg");
assert.ok(jpg.includes("_nc_ht=x") && jpg.includes("oe=123"), "parametrii semnatura pastrati");
assert.equal(toJpgUrl("https://ex.com/imagine.jpg"), "https://ex.com/imagine.jpg");

console.log("parse tests ok | toate testele au trecut");
