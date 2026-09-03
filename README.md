# Elijay Performance Partners — Website + Live Offers Database

The full 5-page site (Home, Verticals, Why Us, Contact, Submit an Offer) is served
by this Express app. Live offers and form submissions both persist in SQLite.

## Folder structure

```
elijay-performance-partners/
├── server.js
├── package.json
├── .env
├── .gitignore
└── public/
    ├── index.html
    ├── verticals.html
    ├── why-us.html
    ├── contact.html
    ├── submit-offer.html
    ├── styles.css
    ├── app.js
    └── assets/
```

## How it fits together

- **Live offers** live in the SQLite `offers` table. When you add or remove an
  offer in Admin Portal, every open Home and Verticals page updates in real time
  (server-sent events). No localStorage.
- **Publisher applications** (Contact page) collect company name, company email,
  contact name, Teams ID, data sample, and sample recording. They save to SQLite
  and forward a copy to Web3Forms.
- **Submit an Offer** (buyers) also saves to SQLite and forwards to Web3Forms.
- **Admin Portal** (gold PIN button, default `1122`) manages live offers.
  **"View Submitted Leads"** opens `/admin/leads` (same PIN).

## Running it locally

1. `npm install`
2. Check `.env` for `WEB3FORMS_ACCESS_KEY` and `ADMIN_PIN`.
3. `npm start`
4. Visit `http://localhost:3000`
5. View leads at `http://localhost:3000/admin/leads`

A `leads.db` file is created in the project root on first start (offers + submissions).

## Deploying

This needs a Node process running continuously (Render, Railway, or Fly.io).
`better-sqlite3` does not persist reliably on Vercel serverless.

## Security notes

- `.env` is gitignored. Set `WEB3FORMS_ACCESS_KEY` and `ADMIN_PIN` on the host.
- The PIN gate is a basic cookie check for a small internal tool, not full auth.
