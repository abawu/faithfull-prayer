const { cookies, cookie, encrypt, exchangeCode, SESSION_COOKIE, STATE_COOKIE } = require('../../_google');

module.exports = async (req, res) => {
  try {
    const jar = cookies(req);
    if (!req.query.code || !jar[STATE_COOKIE] || jar[STATE_COOKIE] !== req.query.state) return res.status(400).send('Google sign-in could not be verified. Please try again.');
    const tokens = await exchangeCode(req.query.code);
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error('Google profile unavailable');
    const profile = await profileResponse.json();
    const session = { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Date.now() + (tokens.expires_in || 3600) * 1000, email: profile.email || '', name: profile.name || '' };
    res.setHeader('Set-Cookie', [cookie(SESSION_COOKIE, encrypt(session), 60 * 60 * 24 * 30), `${STATE_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`]);
    res.redirect('/');
  } catch { res.status(500).send('Google sign-in could not be completed.'); }
};
