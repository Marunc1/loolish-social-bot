export const CONFIG = {
  brand: "Loolish Gaming",
  timezone: "Europe/Bucharest",

  discord: {
    // ID-ul canalului (se poate seta si ca secret DISCORD_CHANNEL_ID)
    channelId: "REPLACE_ME",
    // Webhook Discord - daca e setat (secret DISCORD_WEBHOOK_URL) are prioritate
    // fata de bot, deci nu e nevoie de token deloc
    webhookUrl: "",
  },

  instagram: {
    enabled: true,
    username: "loolishgaming",
    // cate pagini de detaliu (caption + imagine) deschidem per rulare
    maxDetailPages: 4,
  },

  tiktok: {
    enabled: true,
    username: "loolishgaming",
    // instante RSSHub publice (se incearca pe rand, pana merge una)
    rssInstances: [
      "https://rsshub.ktachibana.party",
      "https://rsshub.app",
      "https://rsshub.rssforever.com",
      "https://rsshub.injahow.cn",
      "https://rsshub.feeded.xyz",
    ],
  },

  poll: {
    // cate anunturi posting maximum intr-o rulare
    maxAnnouncePerRun: 5,
    // cate id-uri pastram in istoric
    keepSeen: 80,
  },

  messages: {
    newInstagramPost: "📸 **Post nou pe Instagram**",
    newInstagramReel: "🎬 **Reel nou pe Instagram**",
    newTikTokVideo: "🎵 **Video nou pe TikTok**",
    connected: "✅ Botul de social media e conectat și urmărește conturile Loolish.",
  },

  colors: {
    instagram: 0xe1306c,
    tiktok: 0x25f4ee,
  },
};
