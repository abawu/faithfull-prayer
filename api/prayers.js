const { session, readJournal, writeJournal, json } = require('./_google');

module.exports = async (req, res) => {
  const current = await session(req, res);
  if (!current) return json(res, { error: 'sign_in_required' }, 401);
  try {
    if (req.method === 'GET') return json(res, { records: (await readJournal(current)).records });
    if (req.method === 'PUT') { const records = req.body?.records && typeof req.body.records === 'object' ? req.body.records : {}; await writeJournal(current, records); return json(res, { ok: true }); }
    return json(res, { error: 'method_not_allowed' }, 405);
  } catch { return json(res, { error: 'google_drive_unavailable' }, 502); }
};
