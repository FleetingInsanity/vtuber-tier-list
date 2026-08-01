// Cloudflare Worker — DuckDuckGo image search proxy
// Deploy with: cd worker && npx wrangler deploy
// The deployed URL goes into the app's Settings → Image Search Worker URL

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("q");
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing ?q=", images: [] }), { headers: CORS });
    }

    try {
      // Step 1: fetch the DDG search page to get the vqd token
      const initRes = await fetch(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
        { headers: { "User-Agent": UA } }
      );
      const html = await initRes.text();

      // vqd appears in multiple formats across DDG versions
      const vqdMatch =
        html.match(/vqd=["']?([0-9-]+)["']?/) ||
        html.match(/"vqd"\s*:\s*"([^"]+)"/) ||
        html.match(/vqd%3D([0-9-]+)/);

      if (!vqdMatch) {
        return new Response(JSON.stringify({ error: "vqd not found", images: [] }), { headers: CORS });
      }
      const vqd = vqdMatch[1];

      // Step 2: fetch image results
      const imgRes = await fetch(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${vqd}&f=,,,,,`,
        { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } }
      );
      const data = await imgRes.json();

      const images = (data.results || []).slice(0, 15).map(r => ({
        img:    r.image,
        thumb:  r.thumbnail,
        title:  r.title,
        width:  r.width,
        height: r.height,
      }));

      return new Response(JSON.stringify({ images }), { headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e), images: [] }), { headers: CORS });
    }
  },
};
