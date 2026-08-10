export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const b = req.body || {};
  const row = {
    nombre: String(b.nombre || '').slice(0, 200),
    ciudad: String(b.ciudad || '').slice(0, 120),
    salvo: String(b.salvo || '').slice(0, 100),
    familia: String(b.familia || '').slice(0, 100),
    vivienda: String(b.vivienda || '').slice(0, 100),
    apoyo: String(b.apoyo || '').slice(0, 50),
    detalle: String(b.detalle || '').slice(0, 2000),
    telefono: String(b.telefono || '').slice(0, 50),
    utm: String(b.utm || '').slice(0, 500),
    empleado_id: String(b.empleado_id || '').slice(0, 100),
    user_agent: String(b.user_agent || '').slice(0, 300),
  };
  if (!row.nombre || !row.salvo || !row.familia || !row.vivienda || !row.apoyo)
    return res.status(400).json({ error: 'missing required fields' });

  const errors = [];

  // Primary: Turso (libSQL HTTP)
  if (process.env.TURSO_URL && process.env.TURSO_TOKEN) {
    try {
      const r = await fetch(process.env.TURSO_URL.replace(/\/$/, '') + '/v2/pipeline', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.TURSO_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              type: 'execute',
              stmt: {
                sql: 'INSERT INTO safety_checkins (nombre,ciudad,salvo,familia,vivienda,apoyo,detalle,telefono,utm,empleado_id,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                args: [row.nombre, row.ciudad, row.salvo, row.familia, row.vivienda, row.apoyo, row.detalle, row.telefono, row.utm, row.empleado_id, row.user_agent]
                  .map((v) => ({ type: 'text', value: v })),
              },
            },
            { type: 'close' },
          ],
        }),
      });
      const j = await r.json();
      const failed = !r.ok || (j.results || []).some((x) => x.type === 'error');
      if (!failed) return res.status(200).json({ ok: true, via: 'turso' });
      errors.push('turso:' + JSON.stringify(j).slice(0, 200));
    } catch (e) {
      errors.push('turso:' + e.message);
    }
  }

  // Fallback: Supabase REST
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON) {
    try {
      const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/safety_checkins', {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_ANON,
          Authorization: 'Bearer ' + process.env.SUPABASE_ANON,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      });
      if (r.ok) return res.status(200).json({ ok: true, via: 'supabase' });
      errors.push('supabase:HTTP' + r.status);
    } catch (e) {
      errors.push('supabase:' + e.message);
    }
  }

  return res.status(502).json({ error: 'no backend accepted the write', detail: errors });
}
