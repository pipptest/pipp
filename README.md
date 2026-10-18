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

## Marketplace loop (beta)

1. A page connects Instagram and sets a fee on `/account`.
2. A client signs up, creates a campaign (brief, tags, link, window, photos/videos) and picks pages.
3. The page sees the offer in `/inbox` with a caption drafted from the brief in its voice, then either posts a campaign photo from pipp or accepts and posts it itself.
4. pipp detects self-posted campaign posts (caption or tagged handles, after acceptance) and pulls reach and engagement for the client.

Payments are handled outside pipp during the beta.

Instagram login return address (enter in Meta's business login settings):
`https://pipp-zeta.vercel.app/api/instagram/callback`

## Settings

Set these in Vercel, never in the code:

- `PIPP_EMAIL`: the email shown on the privacy, terms and data deletion pages
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`: from Meta, Instagram > API setup with Instagram login
- `ANTHROPIC_API_KEY`: for caption drafting (optional `ANTHROPIC_MODEL` overrides the model)
- `SUPABASE_POSTGRES_URL`, `SUPABASE_JWT_SECRET`: added automatically by the Supabase integration

Connected accounts' Instagram tokens are stored encrypted. Photos upload straight to Supabase storage (`pipp-uploads`, private), are converted to Instagram's JPEG format, briefly placed in `pipp-media` (public, so Instagram can fetch them) and deleted after publishing. Both buckets are created automatically. The `instagram_accounts` table is created automatically on first use.

## Run locally

```
npm install
npm run dev
```
