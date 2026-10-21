# Loolish Social Bot

Bot Discord care anunță automat **postările și reel-urile noi** de pe conturile oficiale Loolish
(Instagram + TikTok).

Totul rulează pe **Cloudflare Workers Free** (0 lei):

| Sursă | Cum | Cost |
|---|---|---|
| TikTok | feed RSS public (RSSHub) | 0 |
| Instagram | Cloudflare Browser Run (headless Chromium) | 0 (limita free: 10 min browser/zi) |

## Cum funcționează

1. Cron `7 * * * *` (o dată pe oră) → rulare completă.
2. Cron `*/15 * * * *` (la 15 min) → **doar TikTok** prin RSS (fără browser), ca să recuperăm
   repede dacă instanța RSSHub pică.
3. **TikTok**: se citește feed-ul RSS public (RSSHub) → caption + link + data.
4. **Instagram**: Browser Run deschide profilul și extrage linkurile postărilor (`/p/` = post, `/reel/` = reel).
   Pentru fiecare post **nou** se deschide pagina de detaliu de unde se ia caption-ul.
5. Ce e nou (față de `state:seen` din KV) se anunță în Discord cu un **embed** (text + link).
6. La prima rulare nu se anunță nimic — se memorează doar ce există deja (bootstrap), ca să nu apară
   20 de mesaje vechi dintr-o dată.

### Detalii tehnice

- Anunțurile sunt **doar text**: titlu + link + caption + data postării. Fără poze/clipuri.
- **Un singur browser per rulare** (limita Workers Free: 1 browser nou la 20 secunde, 10 min browser/zi).
  Consum tipic: ~6s/rulare (doar pagina de profil) + ~8s per postare nouă (pagina postării).
- TikTok nu folosește deloc browserul (totul vine din RSS).
- **TikTok merge doar prin RSSHub** — pagina de profil TikTok cere login din IP-urile datacenter,
  iar API-urile gratuite (tikwm, tiklydown, isxander) sunt blocate din edge. Singura sursă vie a fost
  `rsshub.ktachibana.party`; restul instanțelor răspund 403/503/530. De aceea sunt 2 runde de
  încercare + 5 instanțe în `config.js`, plus un cron la 15 min fără browser.
- Instagram poate întoarce profilul gol tranzitoriu (rate limit / login wall) → se reîncearcă
  automat o dată după 20s.

## Setup

```bash
npm i
npx wrangler kv namespace create SOCIAL_KV   # doar la prima creare
npx wrangler deploy
```

### Discord

Varianta 1 — **webhook** (zero setup, dar **NU poate suna @everyone**):
```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```

Varianta 2 — **bot token** (nevoie dacă vrei `@everyone` la fiecare anunt):
```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID
```
Botul are nevoie de permisiunile **Send Messages**, **Embed Links** și **Mention Everyone**
în canalul țintă.

`src/config.js` → `discord.mode`:
- `auto` (default) — folosește webhook-ul dacă există, altfel botul
- `webhook` — doar webhook
- `bot` — doar botul (cu `@everyone`, dacă `discord.mentionEveryone` e `true`)

**Schimbarea webhook-ului** (când e gata canalul oficial):
```bash
npx wrangler secret put DISCORD_WEBHOOK_URL   # dai noul URL
```
Poate conține mai multe webhook-uri separate prin virgulă (mesajul se trimite în toate).

## Comenzi

```bash
npm run dev       # dezvoltare locală
npm run deploy    # deploy pe Cloudflare
npm test          # teste de parsing (fără browser)
```

Endpoints:
- `GET /status` — stare (câte id-uri sunt cunoscute, ultimul raport de rulare)
- `GET /run` — rulare manuală (doar dacă există secretul `ALLOW_DEBUG=1`)
- `GET /run?browser=0` — rulare doar-TikTok (fără browser), pentru testare

## Debug

```bash
npx wrangler tail            # loguri live
npx wrangler secret put ALLOW_DEBUG   # apoi "1" ca valoare
npx wrangler secret delete ALLOW_DEBUG # IMPORTANT: scoate-l după testele live
```

Când `ALLOW_DEBUG=1`:
- `GET /run` — rulare manuală
- `GET /test` — mesaj de test în Discord
- `GET /probe?url=...` — verifică o adresă din perspectiva edge-ului

## Config (src/config.js)

- `discord.channelId` / `discord.webhookUrl`
- `discord.mode` — `auto` | `webhook` | `bot` (acum `bot`, ca să sune `@everyone`)
- `cron.full` / `cron.tiktokOnly` — expresiile cron (din `wrangler.toml` trebuie să coincidă)
- `instagram.username` — handle-ul de pe Instagram
- `instagram.maxDetailPages` — câte postări noi deschidem per rulare
- `tiktok.username` + `tiktok.rssInstances` — instanțele RSSHub (se încearcă pe rând, 2 runde)
- `poll.maxAnnouncePerRun` — câte anunțuri maximum pe rulare
- `messages.*` — titlurile embed-urilor
