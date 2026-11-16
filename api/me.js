const { session, json } = require('./_google');

module.exports = async (req, res) => { const current = await session(req, res); return current ? json(res, { email: current.email, name: current.name }) : json(res, { error: 'sign_in_required' }, 401); };
