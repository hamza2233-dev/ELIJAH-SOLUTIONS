require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1122';
const WEB3FORMS_KEY = process.env.WEB3FORMS_ACCESS_KEY || '';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DATABASE SETUP ----------
const db = new Database(path.join(__dirname, 'leads.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    user_type TEXT NOT NULL,
    message TEXT NOT NULL,
    company TEXT,
    teams_id TEXT,
    data_sample TEXT,
    sample_recording TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    payout TEXT NOT NULL,
    geo TEXT NOT NULL,
    desc TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function addColumnIfMissing(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
addColumnIfMissing('submissions', 'company', 'TEXT');
addColumnIfMissing('submissions', 'teams_id', 'TEXT');
addColumnIfMissing('submissions', 'data_sample', 'TEXT');
addColumnIfMissing('submissions', 'sample_recording', 'TEXT');

const insertLeadStmt = db.prepare(`
  INSERT INTO submissions (name, email, user_type, message, company, teams_id, data_sample, sample_recording)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectAllStmt = db.prepare(`
  SELECT * FROM submissions ORDER BY created_at DESC
`);

const selectOffersStmt = db.prepare(`
  SELECT id, title, payout, geo, desc FROM offers ORDER BY created_at ASC
`);

const insertOfferStmt = db.prepare(`
  INSERT INTO offers (id, title, payout, geo, desc) VALUES (?, ?, ?, ?, ?)
`);

const deleteOfferStmt = db.prepare(`DELETE FROM offers WHERE id = ?`);

const defaultOffers = [
  {
    id: 'off_medicare',
    title: 'Medicare Advantage',
    payout: '$45 - $65 / call',
    geo: 'US Nationwide (AEP Priority)',
    desc: 'Live-transferred calls from consumers actively comparing Medicare Advantage plans. Must meet 90-second minimum talk time.'
  },
  {
    id: 'off_finalexpense',
    title: 'Final Expense',
    payout: '$30 - $48 / call',
    geo: 'US Nationwide',
    desc: 'Pre-qualified final expense leads aged 50+, transferred live to licensed agents with real-time capacity.'
  },
  {
    id: 'off_auto',
    title: 'Auto Insurance',
    payout: '$18 - $27 / call',
    geo: 'TX, FL, GA, OH',
    desc: 'High-intent auto insurance shoppers routed to regional carriers and agencies with active buying windows.'
  },
  {
    id: 'off_homeservices',
    title: 'Home Services (Roofing & HVAC)',
    payout: '$35 - $70 / call',
    geo: 'Select Metro Markets',
    desc: 'Homeowner calls for roofing replacement and HVAC repair/install, filtered by property ownership and project timeline.'
  }
];

if (selectOffersStmt.all().length === 0) {
  const seed = db.transaction((rows) => {
    rows.forEach((o) => insertOfferStmt.run(o.id, o.title, o.payout, o.geo, o.desc));
  });
  seed(defaultOffers);
}

// ---------- LIVE OFFER STREAM (SSE) ----------
const offerStreamClients = new Set();

function listOffers() {
  return selectOffersStmt.all();
}

function broadcastOffers() {
  const payload = `data: ${JSON.stringify(listOffers())}\n\n`;
  for (const client of offerStreamClients) {
    client.write(payload);
  }
}

setInterval(() => {
  for (const client of offerStreamClients) {
    client.write(': ping\n\n');
  }
}, 25000);

// ---------- HELPERS ----------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wantsJson(req) {
  return (req.headers.accept || '').includes('application/json') ||
         (req.headers['content-type'] || '').includes('application/json');
}

function isAdmin(req) {
  return req.cookies && req.cookies.leads_auth === '1';
}

function requireLeadsAuth(req, res, next) {
  if (isAdmin(req)) return next();
  res.send(loginPageHtml());
}

function requireAdminApi(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Admin login required.' });
}

function maybeLink(value) {
  if (!value) return '—';
  const safe = escapeHtml(value);
  if (/^https?:\/\//i.test(String(value).trim())) {
    return `<a href="${safe}" target="_blank" rel="noopener">Open</a>`;
  }
  return `<span style="white-space:pre-wrap;">${safe}</span>`;
}

function loginPageHtml(error) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Admin Login | Elijay Performance Partners</title>
      <style>
        body{font-family:system-ui,sans-serif;background:#080A09;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
        .box{background:#0F1210;border:1px solid rgba(212,164,58,0.3);border-radius:14px;padding:36px;width:100%;max-width:320px;text-align:center;}
        h2{color:#D4A43A;margin-top:0;}
        input{width:100%;padding:12px;margin:16px 0;border-radius:8px;border:1px solid #333;background:#151816;color:#fff;box-sizing:border-box;text-align:center;font-size:18px;letter-spacing:4px;}
        button{background:#007A67;color:#fff;border:none;padding:12px;width:100%;border-radius:8px;font-weight:600;cursor:pointer;}
        button:hover{background:#00967D;}
        .err{color:#e0776c;font-size:13px;min-height:16px;}
      </style>
    </head>
    <body>
      <div class="box">
        <h2>Admin Access</h2>
        <p style="color:#A3A3A3;font-size:13.5px;">Enter the PIN to view submitted leads.</p>
        <form method="POST" action="/admin/leads/login">
          <input type="password" name="pin" maxlength="4" inputmode="numeric" autofocus required>
          <div class="err">${error ? escapeHtml(error) : ''}</div>
          <button type="submit">Unlock</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

function setAdminCookie(res) {
  res.cookie('leads_auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  });
}

function forwardWeb3Forms(payload) {
  if (!WEB3FORMS_KEY) return;
  fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      ...payload
    })
  }).catch((err) => console.error('Web3Forms forward failed:', err.message));
}

// ---------- PUBLIC OFFER APIs ----------
app.get('/api/offers', (req, res) => {
  res.json(listOffers());
});

app.get('/api/offers/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(listOffers())}\n\n`);
  offerStreamClients.add(res);
  req.on('close', () => {
    offerStreamClients.delete(res);
  });
});

app.post('/api/offers', requireAdminApi, (req, res) => {
  const { title, payout, geo, desc } = req.body || {};
  if (!title || !payout || !geo) {
    return res.status(400).json({ error: 'Title, payout, and geo-targeting are required.' });
  }
  const id = 'off_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  insertOfferStmt.run(id, String(title).trim(), String(payout).trim(), String(geo).trim(), String(desc || '').trim());
  broadcastOffers();
  res.status(201).json({ status: 'ok', offer: { id, title, payout, geo, desc: desc || '' } });
});

app.delete('/api/offers/:id', requireAdminApi, (req, res) => {
  deleteOfferStmt.run(req.params.id);
  broadcastOffers();
  res.json({ status: 'ok' });
});

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body || {};
  if (pin === ADMIN_PIN) {
    setAdminCookie(res);
    return res.json({ status: 'ok' });
  }
  res.status(401).json({ error: 'Incorrect PIN.' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('leads_auth');
  res.json({ status: 'ok' });
});

// POST /submit-lead — save to SQLite, then optionally forward to Web3Forms
app.post('/submit-lead', async (req, res) => {
  try {
    const {
      name,
      email,
      user_type,
      message,
      company,
      teams_id,
      data_sample,
      sample_recording
    } = req.body;

    if (!name || !email || !user_type) {
      const msg = 'Name, email, and role are required.';
      return wantsJson(req) ? res.status(400).json({ error: msg }) : res.status(400).send(msg);
    }
    if (!['Buyer', 'Publisher'].includes(user_type)) {
      const msg = 'Invalid role selected.';
      return wantsJson(req) ? res.status(400).json({ error: msg }) : res.status(400).send(msg);
    }

    const messageText = (message || '').trim() || '(no additional notes)';

    insertLeadStmt.run(
      name.trim(),
      email.trim(),
      user_type,
      messageText,
      (company || '').trim() || null,
      (teams_id || '').trim() || null,
      (data_sample || '').trim() || null,
      (sample_recording || '').trim() || null
    );

    forwardWeb3Forms({
      subject: `New ${user_type} Submission — Elijay Performance Partners`,
      name,
      email,
      user_type,
      company,
      teams_id,
      data_sample,
      sample_recording,
      message: messageText
    });

    if (wantsJson(req)) {
      return res.status(200).json({ status: 'ok' });
    }
    res.redirect('/?submitted=true');
  } catch (err) {
    console.error('Error saving submission:', err.message);
    const msg = 'Something went wrong. Please try again.';
    wantsJson(req) ? res.status(500).json({ error: msg }) : res.status(500).send(msg);
  }
});

app.post('/admin/leads/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN) {
    setAdminCookie(res);
    return res.redirect('/admin/leads');
  }
  res.status(401).send(loginPageHtml('Incorrect PIN. Try again.'));
});

app.get('/admin/leads/logout', (req, res) => {
  res.clearCookie('leads_auth');
  res.redirect('/admin/leads');
});

app.get('/admin/leads', requireLeadsAuth, (req, res) => {
  const rows = selectAllStmt.all();

  const tableRows = rows.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td><span class="badge ${r.user_type.toLowerCase()}">${escapeHtml(r.user_type)}</span></td>
      <td>${escapeHtml(r.company || '—')}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.teams_id || '—')}</td>
      <td>${maybeLink(r.data_sample)}</td>
      <td>${maybeLink(r.sample_recording)}</td>
      <td style="white-space:pre-wrap;">${escapeHtml(r.message)}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Leads Admin | Elijay Performance Partners</title>
      <style>
        body{font-family:system-ui,sans-serif;background:#080A09;color:#fff;padding:40px;}
        h1{color:#D4A43A;margin-bottom:4px;}
        .top-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;}
        table{width:100%;border-collapse:collapse;margin-top:20px;}
        th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #222;font-size:14px;vertical-align:top;}
        th{color:#D4A43A;text-transform:uppercase;font-size:12px;letter-spacing:0.06em;}
        tr:hover{background:#111;}
        a{color:#00967D;}
        .badge{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;}
        .badge.buyer{background:rgba(0,122,103,0.2);color:#00967D;}
        .badge.publisher{background:rgba(212,164,58,0.2);color:#D4A43A;}
        .count{color:#A3A3A3;font-size:14px;margin-top:-10px;}
        a.logout{color:#A3A3A3;font-size:13px;text-decoration:underline;}
      </style>
    </head>
    <body>
      <div class="top-row">
        <div>
          <h1>Submissions Dashboard</h1>
          <p class="count">${rows.length} total submission${rows.length !== 1 ? 's' : ''}</p>
        </div>
        <a class="logout" href="/admin/leads/logout">Log out</a>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Role</th><th>Company</th><th>Contact</th><th>Email</th>
            <th>Teams ID</th><th>Data Sample</th><th>Recording</th><th>Message</th><th>Submitted</th>
          </tr>
        </thead>
        <tbody>${tableRows || '<tr><td colspan="10">No submissions yet.</td></tr>'}</tbody>
      </table>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
