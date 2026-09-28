const UPSTREAM = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';

const GROUPS = {
  base: ['acque', 'strade'],
  detail17: ['CP.CadastralParcel', 'fabbricati'],
  detail18: ['CP.CadastralParcel', 'fabbricati', 'vestizioni']
};

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

function validBbox(value) {
  if (!value || typeof value !== 'string') return false;
  const p = value.split(',').map(Number);
  return p.length === 4 && p.every(Number.isFinite) && p[0] < p[2] && p[1] < p[3];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Method not allowed');
  }

  const group = String(req.query.group || '');
  const srs = String(req.query.srs || '');
  const bbox = String(req.query.bbox || '');
  const width = Math.min(1024, Math.max(64, Number(req.query.width) || 256));
  const height = Math.min(1024, Math.max(64, Number(req.query.height) || 256));

  if (!GROUPS[group]) return bad(res, 400, 'Invalid group');
  if (!['EPSG:25832', 'EPSG:25833', 'EPSG:25834'].includes(srs)) {
    return bad(res, 400, 'Invalid SRS');
  }
  if (!validBbox(bbox)) return bad(res, 400, 'Invalid BBOX');

  const layers = GROUPS[group];
  const qs = new URLSearchParams({
    language: 'ita',
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layers.join(','),
    STYLES: layers.map(() => '').join(','),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    SRS: srs,
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: bbox
  });

  const upstreamUrl = UPSTREAM + '?' + qs.toString();
  const maxAttempts = 3;
  let lastStatus = 502;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const upstream = await fetch(upstreamUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Phillo-GeoCAD/11',
          'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5'
        }
      });
      clearTimeout(timer);

      lastStatus = upstream.status;
      const type = upstream.headers.get('content-type') || '';

      if (upstream.ok && type.includes('image')) {
        const body = Buffer.from(await upstream.arrayBuffer());

        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Phillo-Upstream-Attempts', String(attempt));
        res.setHeader('X-Phillo-Layers', layers.join(','));
        return res.status(200).send(body);
      }

      lastError = 'Upstream HTTP ' + upstream.status + ' (' + type + ')';
      if (upstream.status >= 400 && upstream.status < 500 && upstream.status !== 429) break;
    } catch (err) {
      clearTimeout(timer);
      lastError = err && err.name === 'AbortError' ? 'Upstream timeout' : String(err && err.message || err);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Phillo-Upstream-Status', String(lastStatus));
  return bad(res, 502, lastError || 'WMS upstream unavailable');
}
