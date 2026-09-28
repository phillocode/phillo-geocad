import sharp from 'sharp';
import proj4 from 'proj4';

const UPSTREAM = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
const OUT = 256;
const SOURCE_LONG_EDGE = 384;

const GROUPS = {
  base: ['acque', 'strade'],
  detail17: ['CP.CadastralParcel', 'fabbricati'],
  detail18: ['CP.CadastralParcel', 'fabbricati', 'vestizioni']
};

proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:25834', '+proj=utm +zone=34 +ellps=GRS80 +units=m +no_defs');

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

function tileLon(x, z, px) {
  const world = OUT * Math.pow(2, z);
  return ((x * OUT + px + 0.5) / world) * 360 - 180;
}

function tileLat(y, z, py) {
  const world = OUT * Math.pow(2, z);
  const t = Math.PI * (1 - 2 * (y * OUT + py + 0.5) / world);
  return Math.atan(Math.sinh(t)) * 180 / Math.PI;
}

function zoneForLon(lon) {
  if (lon < 12) return 32;
  if (lon < 18) return 33;
  return 34;
}

function buildTransformGrid(x, y, z, srs) {
  const projector = proj4('EPSG:4326', srs);
  const coords = new Float64Array(OUT * OUT * 2);
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;

  for (let py = 0; py < OUT; py++) {
    const lat = tileLat(y, z, py);
    for (let px = 0; px < OUT; px++) {
      const lon = tileLon(x, z, px);
      const p = projector.forward([lon, lat]);
      const i = (py * OUT + px) * 2;
      coords[i] = p[0];
      coords[i + 1] = p[1];
      if (p[0] < minE) minE = p[0];
      if (p[0] > maxE) maxE = p[0];
      if (p[1] < minN) minN = p[1];
      if (p[1] > maxN) maxN = p[1];
    }
  }

  const spanE = Math.max(0.001, maxE - minE);
  const spanN = Math.max(0.001, maxN - minN);
  const padE = spanE / (OUT - 1) * 2;
  const padN = spanN / (OUT - 1) * 2;
  const bbox = [minE - padE, minN - padN, maxE + padE, maxN + padN];

  const wMeters = bbox[2] - bbox[0];
  const hMeters = bbox[3] - bbox[1];
  const maxMeters = Math.max(wMeters, hMeters);
  const srcW = Math.max(256, Math.round(SOURCE_LONG_EDGE * wMeters / maxMeters));
  const srcH = Math.max(256, Math.round(SOURCE_LONG_EDGE * hMeters / maxMeters));

  return { coords, bbox, srcW, srcH };
}

function makeWmsUrl(layers, srs, bbox, width, height) {
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
    BBOX: bbox.join(',')
  });
  return UPSTREAM + '?' + qs.toString();
}

async function fetchUpstream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Phillo-GeoCAD/12',
        'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function reprojectRaster(inputBuffer, grid) {
  const decoded = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const src = decoded.data;
  const sw = decoded.info.width;
  const sh = decoded.info.height;
  const channels = decoded.info.channels;
  if (channels !== 4) throw new Error('Unexpected source channels: ' + channels);

  const out = Buffer.alloc(OUT * OUT * 4);
  const minE = grid.bbox[0], minN = grid.bbox[1];
  const maxE = grid.bbox[2], maxN = grid.bbox[3];
  const spanE = maxE - minE, spanN = maxN - minN;

  for (let i = 0; i < OUT * OUT; i++) {
    const e = grid.coords[i * 2];
    const n = grid.coords[i * 2 + 1];
    const sx = ((e - minE) / spanE) * sw - 0.5;
    const sy = ((maxN - n) / spanN) * sh - 0.5;

    const oi = i * 4;
    if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
      out[oi] = out[oi + 1] = out[oi + 2] = out[oi + 3] = 0;
      continue;
    }

    const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fx = sx - Math.floor(sx);
    const fy = sy - Math.floor(sy);
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = (y0 * sw + x1) * 4;
    const i01 = (y1 * sw + x0) * 4;
    const i11 = (y1 * sw + x1) * 4;

    for (let ch = 0; ch < 4; ch++) {
      out[oi + ch] = Math.max(0, Math.min(255, Math.round(
        src[i00 + ch] * w00 +
        src[i10 + ch] * w10 +
        src[i01 + ch] * w01 +
        src[i11 + ch] * w11
      )));
    }
  }

  return sharp(out, { raw: { width: OUT, height: OUT, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Method not allowed');
  }

  const group = String(req.query.group || '');
  const x = Number(req.query.x);
  const y = Number(req.query.y);
  const z = Number(req.query.z);

  if (!GROUPS[group]) return bad(res, 400, 'Invalid group');
  if (!Number.isInteger(z) || z < 17 || z > 22) return bad(res, 400, 'Invalid zoom');
  const n = Math.pow(2, z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    return bad(res, 400, 'Invalid tile coordinates');
  }

  const centerLon = ((x + 0.5) / n) * 360 - 180;
  const zone = zoneForLon(centerLon);
  const srs = 'EPSG:258' + zone;
  const layers = GROUPS[group];
  const grid = buildTransformGrid(x, y, z, srs);
  const upstreamUrl = makeWmsUrl(layers, srs, grid.bbox, grid.srcW, grid.srcH);

  const maxAttempts = 3;
  let lastStatus = 502;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const upstream = await fetchUpstream(upstreamUrl);
      lastStatus = upstream.status;
      const type = upstream.headers.get('content-type') || '';

      if (upstream.ok && type.includes('image')) {
        const input = Buffer.from(await upstream.arrayBuffer());
        const output = await reprojectRaster(input, grid);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('X-Phillo-Upstream-Attempts', String(attempt));
        res.setHeader('X-Phillo-Layers', layers.join(','));
        res.setHeader('X-Phillo-Reprojected', 'true');
        res.setHeader('X-Phillo-UTM', srs);
        res.setHeader('X-Phillo-Source-Size', grid.srcW + 'x' + grid.srcH);
        return res.status(200).send(output);
      }

      lastError = 'Upstream HTTP ' + upstream.status + ' (' + type + ')';
      if (upstream.status >= 400 && upstream.status < 500 && upstream.status !== 429) break;
    } catch (err) {
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
