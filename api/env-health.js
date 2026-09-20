export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  return res.status(200).json({
    ok: true,
    build: "2026-09-20.4",
    supabase_url_present: Boolean(url),
    service_role_key_present: Boolean(key),
    supabase_url_looks_valid:
      url.startsWith("https://") && url.includes(".supabase.co"),
    service_role_key_length: key.length
  });
}
