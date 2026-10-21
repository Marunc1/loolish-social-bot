import puppeteer from "@cloudflare/puppeteer";

// Limita Workers Free: 1 browser nou la 20 secunde. Retinem doar daca primim 429 la pornire.
export async function withBrowser(env, fn) {
  let browser = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      browser = await puppeteer.launch(env.BROWSER);
      break;
    } catch (err) {
      const status = err && (err.status || (err.cause && err.cause.status));
      if (status === 429 && attempt === 0) {
        console.error("browser 429 la pornire, reincearc in 25s");
        await new Promise((r) => setTimeout(r, 25000));
        continue;
      }
      throw err;
    }
  }
  if (!browser) throw new Error("nu s-a putut porni browserul");
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function newPage(browser, viewport = { width: 1400, height: 2000 }) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport(viewport);
  return page;
}
