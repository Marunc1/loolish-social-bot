const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
  "#039": "'",
  "#x2F": "/",
  "#47": "/",
};

export function decodeEntities(input) {
  return String(input == null ? "" : input).replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (m, name) => {
      const key = name.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith("#x")) {
        const code = parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      if (key.startsWith("#")) {
        const code = parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    }
  );
}

export function stripCdata(input) {
  return String(input == null ? "" : input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

export function tagText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = String(xml).match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1]));
}

export function tagAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\s[^>]*${attr}=["']([^"']*)["']`);
  const m = String(xml).match(re);
  return m ? decodeEntities(m[1]) : "";
}

export function splitItems(xml) {
  return String(xml)
    .split(/<item[\s>]/)
    .slice(1)
    .map((part) => part.split(/<\/item>/)[0]);
}

export function clampText(text, max = 3500) {
  const s = String(text == null ? "" : text).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// og:title  = 'Loolish Gaming on Instagram: "CAPTION"'
// og:description = '53 likes, 6 comments - loolishgaming on October 17, 2026: "CAPTION".'
export function parseInstagramMeta(ogTitle, ogDescription) {
  const title = String(ogTitle || "");
  const desc = String(ogDescription || "");

  let caption = "";
  const quoted = /"([\s\S]*)"/.exec(title) || /"([\s\S]*)"/.exec(desc);
  if (quoted) caption = quoted[1].trim();
  if (!caption) caption = title.replace(/^.*?on Instagram:\s*/i, "").trim();

  const dateText = (/ on ([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(desc) || [])[1] || "";

  let publishedAt = null;
  if (dateText) {
    const t = Date.parse(dateText);
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
  }

  return { caption, dateText, publishedAt };
}
