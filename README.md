# pipp

Paid posts, straight from labels and artists to the pages that post them.

This is the real app (private beta). The clickable design prototype lives separately.

## Stack

- Next.js (this repo), hosted on Vercel
- Supabase for the database and file storage (coming next)
- Instagram API with Instagram Login for connecting pages (coming next)

## Pages so far

- `/` home
- `/privacy` privacy policy (required by Meta)
- `/terms` terms of use
- `/data-deletion` data deletion instructions (required by Meta)
- `/connect` connect an Instagram professional account
- `/account` the connected page: followers, posts and recent captions
- `/draft` draft three captions in the page's voice from a brief (Claude API)
- `/publish` upload a photo, review, then publish it to the connected page
- `/inbox` a page's campaign offers; `/inbox/[id]` brief, files, drafted caption, post from pipp or accept and post yourself
- `/c` client (label) campaigns; `/c/signup`, `/c/login`; `/c/new` create a campaign; `/c/[id]` status and results per page
- `/c/assets` a label's asset library: folders, uploads, search, move and delete; campaigns pick files from it and new campaign uploads are saved to it

## Marketplace loop (beta)

1. A page connects Instagram and sets a fee on `/account`.
2. A client signs up, creates a campaign (brief, tags, link, window, photos/videos) and picks pages.
3. The page sees the offer in `/inbox` with a caption drafted from the brief in its voice, then either posts a campaign photo from pipp or accepts and posts it itself.
4. pipp detects self-posted campaign posts (caption or tagged handles, after acceptance) and pulls reach and engagement for the client.

Payments are handled outside pipp during the beta.

Also in the loop:
- **Deadlines:** offers expire if the page doesn't reply within 24, 48 or 72 hours (set per campaign).
- **Caption approval:** if a page rewrites the drafted caption, the label approves it or asks for changes first (on by default; adding #ad doesn't count as a rewrite).
- **Posting:** photos post as feed posts, videos as Reels (also shown on the grid), or 2–10 files as a carousel in the label's order (photos cropped to the first photo's shape), now or scheduled for a date and time.
- **File order:** labels set the order of campaign files when creating a campaign; pages see them numbered and download them numbered.
- **Page profiles:** labels see followers, engagement, average likes and comments, pipp history and recent posts (`/c/pages/[id]`).
- **Email alerts:** new offers, approvals, change requests, accept/decline, expiry, post live, post failed.

## Background jobs

- Every 5 minutes, a job inside Supabase (pg_cron + pg_net, set up automatically by `lib/scheduler.js`) calls `/api/cron/tick`: expires offers, publishes scheduled posts, finishes videos still processing, and detects self-posted campaign posts.
- Daily, Vercel calls `/api/cron/refresh-tokens`: renews Instagram access, refreshes page stats, checks the 5-minute job exists, and runs one tick.

Instagram login return address (enter in Meta's business login settings):
`https://pipp-zeta.vercel.app/api/instagram/callback`

## Settings

Set these in Vercel, never in the code:

- `PIPP_EMAIL`: the email shown on the privacy, terms and data deletion pages
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`: from Meta, Instagram > API setup with Instagram login
- `ANTHROPIC_API_KEY`: for caption drafting (optional `ANTHROPIC_MODEL` overrides the model)
- `SUPABASE_POSTGRES_URL`, `SUPABASE_JWT_SECRET`: added automatically by the Supabase integration
- Email, one of: `RESEND_API_KEY` (with `EMAIL_FROM`, e.g. `pipp <alerts@yourdomain.com>`), or SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and optional `EMAIL_FROM`). Without these, emails are only written to the logs.
- `SITE_URL` (optional): the address used in email links; defaults to the Vercel production address
- `CRON_SECRET` (recommended): any long random string; locks the daily token refresh job to Vercel's scheduler

Instagram access lasts 60 days. A daily job (`vercel.json`, `/api/cron/refresh-tokens`) renews each page's access once it has under 50 days left, and pages are also renewed when they visit pipp.

Connected accounts' Instagram tokens are stored encrypted. Photos upload straight to Supabase storage (`pipp-uploads`, private), are converted to Instagram's JPEG format, briefly placed in `pipp-media` (public, so Instagram can fetch them) and deleted after publishing. Both buckets are created automatically. The `instagram_accounts` table is created automatically on first use.

## Run locally

```
npm install
npm run dev
```
