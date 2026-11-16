const crypto = require('node:crypto');

const SESSION_COOKIE = 'rooted_session';
const STATE_COOKIE = 'rooted_oauth_state';
const FILE_NAME = 'rooted-prayer-journal.json';

function secretKey() {
  return crypto.createHash('sha256').update(process.env.GOOGLE_CLIENT_SECRET || 'rooted-dev-key').digest();
}

function encode(value) { return Buffer.from(value).toString('base64url'); }
function decode(value) { return Buffer.from(value, 'base64url').toString('utf8'); }

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(encode).join('.');
}

function decrypt(value) {
  try {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
  } catch { return null; }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function redirectUri() { return process.env.GOOGLE_REDIRECT_URI || 'https://faithfull-prayer.vercel.app/auth/google/callback'; }
function json(res, body, status = 200) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').send(body); }

async function exchangeCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
  if (!response.ok) throw new Error('Google token exchange failed');
  return response.json();
}

async function refresh(session) {
  if (session.access_token && session.expires_at > Date.now() + 60_000) return session;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: session.refresh_token, grant_type: 'refresh_token' }) });
  if (!response.ok) throw new Error('Google token refresh failed');
  const tokens = await response.json();
  return { ...session, access_token: tokens.access_token, expires_at: Date.now() + (tokens.expires_in || 3600) * 1000 };
}

async function session(req, res) {
  const current = decrypt(cookies(req)[SESSION_COOKIE] || '');
  if (!current) return null;
  try {
    const updated = await refresh(current);
    if (updated.access_token !== current.access_token) res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, encrypt(updated), 60 * 60 * 24 * 30));
    return updated;
  } catch { return null; }
}

async function driveRequest(sessionData, url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${sessionData.access_token}` } });
  if (!response.ok) throw new Error(`Google Drive request failed: ${response.status}`);
  return response;
}

async function readJournal(sessionData) {
  const query = encodeURIComponent(`name = '${FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
  const files = await (await driveRequest(sessionData, `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name)`)).json();
  if (!files.files?.length) return { id: null, records: {} };
  const id = files.files[0].id;
  const response = await driveRequest(sessionData, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return { id, records: await response.json() };
}

async function writeJournal(sessionData, records) {
  const current = await readJournal(sessionData);
  if (current.id) {
    await driveRequest(sessionData, `https://www.googleapis.com/upload/drive/v3/files/${current.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(records) });
    return;
  }
  const boundary = `rooted-${crypto.randomBytes(8).toString('hex')}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(records)}\r\n--${boundary}--`;
  await driveRequest(sessionData, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
}

module.exports = { SESSION_COOKIE, STATE_COOKIE, cookie, clearCookie, cookies, decrypt, encrypt, redirectUri, exchangeCode, session, driveRequest, readJournal, writeJournal, json };
