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

## Settings

Set these in Vercel, never in the code:

- `PIPP_EMAIL`: the email shown on the privacy, terms and data deletion pages

## Run locally

```
npm install
npm run dev
```
