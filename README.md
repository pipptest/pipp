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

Instagram login return address (enter in Meta's business login settings):
`https://pipp-zeta.vercel.app/api/instagram/callback`

## Settings

Set these in Vercel, never in the code:

- `PIPP_EMAIL`: the email shown on the privacy, terms and data deletion pages
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`: from Meta, Instagram > API setup with Instagram login
- `SUPABASE_POSTGRES_URL`, `SUPABASE_JWT_SECRET`: added automatically by the Supabase integration

Connected accounts' Instagram tokens are stored encrypted. The `instagram_accounts` table is created automatically on first use.

## Run locally

```
npm install
npm run dev
```
