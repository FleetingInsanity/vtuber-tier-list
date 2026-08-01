// Cloudflare Worker — image search proxy (Bing primary, DDG fallback)
// Deploy: cd worker && npx wrangler deploy

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

    // Try Bing first — no token required, image URLs in murl JSON fields
    let images = await fetchBing(query);

    // Fall back to DuckDuckGo if Bing returns nothing
    if (!images.length) {
      images = await fetchDDG(query);
    }

    return new Response(JSON.stringify({ images }), { headers: CORS });
  },
};

async function fetchBing(query) {
  try {
    const res = await fetch(
      `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
      { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } }
    );
    const html = await res.text();

    // Bing embeds image metadata as JSON — murl = media/original URL, turl = thumbnail URL
    const images = [];
    const re = /"murl":"([^"]+)","turl":"([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null && images.length < 15) {
      images.push({ img: m[1], thumb: m[2], title: "", source: "Bing" });
    }
    return images;
  } catch (e) {
    return [];
  }
}

async function fetchDDG(query) {
  try {
    // Step 1: get vqd token
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers: { "User-Agent": UA } }
    );
    const html = await initRes.text();

    // Try every known vqd format DDG has used
    const vqdMatch =
      html.match(/vqd=["']([^"']+)["']/) ||
      html.match(/"vqd"\s*:\s*"([^"]+)"/) ||
      html.match(/vqd=([\d-]+)/) ||
      html.match(/vqd%3D([\d-]+)/);

    if (!vqdMatch) return [];
    const vqd = vqdMatch[1];

    // Step 2: fetch image results
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&p=1&vqd=${encodeURIComponent(vqd)}&f=,,,,,`,
      { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } }
    );
    const data = await imgRes.json();
    return (data.results || []).slice(0, 15).map(r => ({
      img: r.image, thumb: r.thumbnail, title: r.title || "", source: "DDG",
    }));
  } catch (e) {
    return [];
  }
}
