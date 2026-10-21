# Loolish Social Bot

Bot Discord care anunță automat **postările și reel-urile noi** de pe conturile oficiale Loolish
(Instagram + TikTok).

Totul rulează pe **Cloudflare Workers Free** (0 lei):

| Sursă | Cum | Cost |
|---|---|---|
| TikTok | feed RSS public (RSSHub) | 0 |
| Instagram | Cloudflare Browser Run (headless Chromium) | 0 (limita free: 10 min browser/zi) |

## Cum funcționează

1. Cron `7 * * * *` (o dată pe oră) → `tick`.
2. TikTok: se citește feed-ul RSS, se extrag titlu + link + thumbnail.
3. Instagram: Browser Run deschide profilul și extrage linkurile postărilor (`/p/` = post, `/reel/` = reel).
   Pentru fiecare post **nou** se deschide pagina de detaliu ca se ia caption-ul, imaginea și numărul de like-uri.
4. Ce e nou (față de `state:seen` din KV) se anunță în Discord cu un **embed** (imagine + caption + link).
5. La prima rulare nu se anunță nimic — se memorează doar ce există deja (bootstrap), ca să nu apară
   20 de mesaje vechi dintr-o dată.

## Setup

```bash
npm i
npx wrangler kv namespace create SOCIAL_KV   # doar la prima creare
npx wrangler deploy
```

Secrete (pe Cloudflare, nu în repo):

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID
```

Alternativ, fără bot deloc — folosește un **webhook**:
```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```
(webhook-ul are prioritate față de bot)

Botul are nevoie de permisiunea **Send Messages** + **Embed Links** în canalul țintă.

## Comenzi

```bash
npm run dev       # dezvoltare locală
npm run deploy    # deploy pe Cloudflare
npm test          # teste de parsing (fără browser)
```

Endpoints:
- `GET /status` — stare (câte id-uri sunt cunoscute, ultimul raport de rulare)
- `GET /run` — rulare manuală (doar dacă există secretul `ALLOW_DEBUG=1`)

## Debug

```bash
npx wrangler tail            # loguri live
npx wrangler secret put ALLOW_DEBUG   # apoi "1" ca valoare
npx wrangler secret delete ALLOW_DEBUG # IMPORTANT: scoate-l după testele live
```

## Config (src/config.js)

- `discord.channelId` / `discord.webhookUrl`
- `instagram.username` — handle-ul de pe Instagram
- `tiktok.username` + `tiktok.rssInstances` — instanțele RSSHub (se încearcă pe rând)
- `poll.maxAnnouncePerRun` — câte anunțuri maximum pe rulare
- `messages.*` — titlurile embed-urilor
