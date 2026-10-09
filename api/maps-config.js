export default function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!key) {
    return res.status(500).json({
      error: 'GOOGLE_MAPS_API_KEY non configurata'
    });
  }

  return res.status(200).json({ key });
}
