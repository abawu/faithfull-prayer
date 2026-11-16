const { clearCookie, SESSION_COOKIE } = require('../_google');

module.exports = (req, res) => { res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE)); res.redirect('/'); };
