// Cloudflare Worker untuk konfigurasi NdaxTrade.
// GET dibuka untuk APK utama. PUT wajib header X-Dev-Token yang sama dengan secret DEV_TOKEN.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Dev-Token',
};
const json = (body, status = 200) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/api/config') return json('{"error":"not found"}', 404);

    if (req.method === 'GET') return json((await env.NDAX_CFG.get('config')) || '{}');

    if (req.method === 'PUT') {
      if (req.headers.get('X-Dev-Token') !== env.DEV_TOKEN) return json('{"error":"unauthorized"}', 401);
      const body = await req.text();
      if (body.length > 65536) return json('{"error":"too large"}', 413);
      let obj;
      try { obj = JSON.parse(body); } catch { return json('{"error":"bad json"}', 400); }
      if (!obj || typeof obj !== 'object' || !obj.methods || !obj.timeframes) return json('{"error":"invalid config"}', 400);
      await env.NDAX_CFG.put('config', JSON.stringify(obj));
      return json('{"ok":true}');
    }
    return json('{"error":"method not allowed"}', 405);
  },
};
