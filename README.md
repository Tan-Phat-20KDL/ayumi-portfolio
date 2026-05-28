# Pham Tran Tan Phat — Portfolio

Single-page personal portfolio. Plain HTML/CSS/JS + Cloudflare Pages + a thin Pages Functions API backed by Cloudflare KV. No build step, no external services beyond Cloudflare.

- 🔎 **SEO-ready** — OpenGraph, Twitter cards, JSON-LD `Person`, `sitemap.xml`, `robots.txt`, security headers, **built-in SEO score panel**.
- ✏️ **On-page editor** — sign-in button top-right; in edit mode every text field becomes editable, lists get add/delete buttons, project bodies get a **WYSIWYG toolbar** (Word-style).
- 🖼 **Avatar drag-drop** — drop an image onto the avatar; auto-resized to 512px and stored inline as base64 so guests can see it without any auth.
- 💾 **Storage on Cloudflare KV** — your edits are saved server-side via `/api/data`; visitors read the same data. No Google account, no OAuth.
- ✉️ **Contact form → Gmail** — uses EmailJS (free tier, optional).
- 🌓 **Light / dark theme**, fully responsive.

---

## 1. Project layout

```
ayumi_portfolio/
  index.html
  styles.css
  app.js          ← renders the page from /api/data (falls back to data.json)
  editor.js       ← inline edit mode + WYSIWYG + SEO score panel
  auth.js         ← admin sign-in + /api calls
  email.js        ← EmailJS contact form
  data.json       ← initial seed (used the very first time before KV has anything)
  functions/
    api/
      data.js     ← GET (read KV) + POST (write, requires bearer)
      auth.js     ← POST { password } → verifies against ADMIN_PASSWORD
  manifest.json
  sitemap.xml
  robots.txt
  _headers        ← cache + security headers
  _redirects      ← hides dev / source files from the public site
  404.html
  assets/
    favicon.svg avatar.svg og-cover.svg
  wrangler.toml package.json README.md
```

No build step. Drag the whole folder into Cloudflare Pages → Upload assets and it works.

---

## 2. Deploy in 5 minutes

### 2a. Upload the site

Cloudflare Dashboard → **Workers & Pages → Create → Pages → Upload assets** → drag the whole `ayumi_portfolio/` folder. After upload you get a URL like `https://<project>.pages.dev`.

### 2b. Wire up KV + password (one-time, ~3 min)

In the same project → **Settings → Functions**:

1. **KV namespace bindings → Add binding**
   - **Variable name**: `PORTFOLIO_KV`  ← must be this exact name
   - **KV namespace**: click *Create new* → name it `portfolio-data` → Save
2. **Environment variables → Add variable**
   - **Variable name**: `ADMIN_PASSWORD`  ← must be this exact name
   - **Value**: pick a strong password (24+ random chars recommended)
   - Save
3. **Deployments** tab → menu (…) on the latest deployment → **Retry deployment** so it picks up the new bindings.

### 2c. Sign in & edit

1. Open `https://<project>.pages.dev/`
2. Top-right **Sign in** → paste your `ADMIN_PASSWORD` → Sign in
3. Click your avatar → **Edit mode** badge flips to `on`
4. Click any text to edit. For projects, the description area uses a Word-style toolbar (headings, bold, italic, lists, links).
5. Drag an image onto the avatar circle to replace it (auto-resized & embedded).
6. Changes auto-save 1.5 s after you stop typing.
7. Open the dropdown again → **SEO score** to see what's missing.

---

## 3. Local development

```bash
npm install
npm run dev     # wrangler pages dev — serves Functions + KV emulator at http://localhost:8788
```

Wrangler will use a local KV preview namespace automatically. To set the password locally, create a `.dev.vars` file in the project root:

```
ADMIN_PASSWORD=local-test-password
```

(Don't commit `.dev.vars`.)

---

## 4. Wire up the contact form (EmailJS, optional)

If you skip this, the contact form falls back to opening the visitor's mail app via `mailto:`.

1. Sign up at https://www.emailjs.com (free tier = 200 emails/month).
2. **Email Services → Add New Service → Gmail** → authorize your gmail.
3. **Email Templates → Create New Template**. Use variables `{{from_name}}`, `{{reply_to}}`, `{{subject}}`, `{{message}}`. To Email = your gmail. Reply To = `{{reply_to}}`.
4. Grab Public Key (Account → API Keys), Service ID, Template ID.
5. While signed in, open DevTools console and run:
   ```js
   const d = window.PortfolioState.data;
   d.config.emailjs = { publicKey: 'XXX', serviceId: 'service_xxx', templateId: 'template_xxx' };
   await window.Auth.saveData(d);
   ```
   (Substitute your real values.) Reload — the contact form will now deliver email.

---

## 5. Data schema

`data.json` (or the latest KV copy) drives everything.

| Path                | Type                                            | Notes |
| ------------------- | ----------------------------------------------- | ----- |
| `meta.*`            | site title, description, URL, OG image          | drives `<title>` + meta + canonical |
| `profile.*`         | name, title, tagline, summary, avatar (URL or `data:`-uri), email, phone, location, socials[] | hero + contact card |
| `education[]`       | school, degree, period, details                 |
| `certificates[]`    | name, issuer, year                              |
| `languages[]`       | name, level                                     |
| `skills[]`          | category, items[]                               |
| `experience[]`      | company, role, period, location, summary        |
| `projects[]`        | name, company, role, duration, tech[], summary, **body** (HTML) | rich-text body is rendered as HTML |
| `contact.*`         | headline, subhead                               |
| `config.emailjs.*`  | publicKey, serviceId, templateId                |

The old `highlights[]` field on projects is auto-migrated into `body` HTML on first load — you don't need to touch existing data.

---

## 6. Costs & limits

Everything fits comfortably in Cloudflare's free tier:

| Service                | Free tier                                | This site                |
| ---------------------- | ---------------------------------------- | ------------------------ |
| Pages bandwidth        | Unlimited                                | ✓                        |
| Pages requests         | Unlimited                                | ✓                        |
| Pages Functions        | 100k invocations / day                   | Maybe ~50 / day per visitor |
| Workers KV reads       | 100k / day                               | 1 per page load          |
| Workers KV writes      | 1,000 / day                              | ~5 per edit burst         |
| Workers KV storage     | 1 GB                                     | <1 MB                    |

You will not hit any of these unless your portfolio goes viral.

---

## 7. Security model

- **Owner-only writes**: `/api/data` POST requires `Authorization: Bearer <ADMIN_PASSWORD>`. The password is set as an env var in Cloudflare (not in the deployed code).
- **Public reads**: `/api/data` GET is open — that's intentional; visitors need to see your portfolio.
- **HTML sanitization**: rich-text body content is sanitized in-browser (script/onload/javascript: stripped) before render.
- **No third-party SaaS**: aside from optional EmailJS for contact form, everything stays on Cloudflare.

---

## 8. Common gotchas

| Symptom                                           | Fix |
| ------------------------------------------------- | --- |
| Sign in says "Server missing ADMIN_PASSWORD env var" | Step 2b.2: set the env var in Cloudflare Pages → redeploy |
| Sign in says "KV namespace PORTFOLIO_KV not bound" | Step 2b.1: create + bind KV namespace → redeploy |
| Console shows old `vX loaded` after upload         | Hard refresh (Ctrl+Shift+R). `_headers` is set to `no-cache` for JS/CSS but the browser/Cloudflare edge may still serve stale once |
| Save fails with 401                                | Wrong password — sign out + sign in again |
| "Read-only" after sign-in                          | `profile.email` in data doesn't match… (irrelevant in the password-auth model — should never appear now. If it does, sign out and back in.) |

---

Built for Phat, hosted on Cloudflare Pages, edited from anywhere with a single password.
