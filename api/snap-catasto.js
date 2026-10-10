const WFS = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

function extractPaths(xml) {
  const paths = [];
  const re = /<gml:posList(?:\s[^>]*)?>([\s\S]*?)<\/gml:posList>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const nums = m[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
    const path = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const lat = nums[i];
      const lng = nums[i + 1];
      if (lat >= 30 && lat <= 50 && lng >= 5 && lng <= 20) path.push({ lat, lng });
    }
    if (path.length >= 2) paths.push(path);
  }
  return paths;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Method not allowed');
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.max(0.5, Math.min(20, Number(req.query.radius || 8)));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 30 || lat > 50 || lng < 5 || lng > 20) {
    return bad(res, 400, 'Coordinate non valide');
  }

  const dLat = radius / 111320;
  const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const dLng = radius / (111320 * cosLat);

  const qs = new URLSearchParams({
    language: 'ita',
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: 'CP:CadastralParcel',
    SRSNAME: 'urn:ogc:def:crs:EPSG::6706',
    COUNT: '100',
    BBOX: [
      (lat - dLat).toFixed(8),
      (lng - dLng).toFixed(8),
      (lat + dLat).toFixed(8),
      (lng + dLng).toFixed(8)
    ].join(',')
  });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);

  try {
    const r = await fetch(WFS + '?' + qs.toString(), {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Phillo-GeoCAD/13 Snap',
        'Accept': 'application/gml+xml,text/xml,application/xml;q=0.9,*/*;q=0.5'
      }
    });

    if (!r.ok) return bad(res, 502, 'WFS HTTP ' + r.status);

    const xml = await r.text();
    const paths = extractPaths(xml);

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ paths, radius });
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'Timeout WFS' : String(err?.message || err);
    return bad(res, 502, message);
  } finally {
    clearTimeout(timer);
  }
}
