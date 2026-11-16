const crypto = require('node:crypto');
const { cookie, redirectUri, STATE_COOKIE } = require('../_google');

module.exports = (req, res) => {
  const state = crypto.randomBytes(24).toString('base64url');
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata', state });
  res.setHeader('Set-Cookie', cookie(STATE_COOKIE, state, 600));
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};
