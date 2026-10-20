'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptAndPublish, acceptSelf, cancelSchedule, declineOffer, newDraft, requestApproval } from '../actions';

function normalise(t) {
  return String(t || '').replace(/#ad\b/gi, '').toLowerCase().replace(/[^a-z0-9@#]+/g, ' ').trim();
}

function localInputValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// X counts emoji and CJK as 2 characters and every link as 23 (same as the server check).
function xLength(text) {
  const withLinks = String(text || '').replace(/https?:\/\/\S+/gi, 'x'.repeat(23));
  let n = 0;
  for (const ch of withLinks) {
    const c = ch.codePointAt(0);
    n += c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2;
  }
  return n;
}

// What each platform can post from pipp (mirrors lib/platforms POSTING).
const RULES = {
  instagram: { multi: 10, photosOnly: false, videoOnly: false, multiName: 'carousel' },
  x: { multi: 4, photosOnly: true, videoOnly: false, multiName: 'photo set' },
  tiktok: { multi: 0, photosOnly: false, videoOnly: true, multiName: null },
};

const PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
};

export default function OfferActions({
  offerId, status, draft, initialCaption, approved, approvedCaption, approveEdits, scheduledFor, files: allFiles, username, clientName,
  platform = 'instagram', platformLabel = 'Instagram', maxChars = 2200, tiktok = null,
}) {
  const router = useRouter();
  const rules = RULES[platform] || RULES.instagram;
  const files = rules.videoOnly ? allFiles.filter((f) => f.isVideo) : allFiles;
  const multiFiles = (rules.photosOnly ? files.filter((f) => !f.isVideo) : files).slice(0, rules.multi);
  const canMulti = rules.multi > 0 && multiFiles.length >= 2;

  const [caption, setCaption] = useState(initialCaption);
  const [fileId, setFileId] = useState(files[0]?.id || null);
  const [kind, setKind] = useState(canMulti ? 'carousel' : 'single');
  const [mode, setMode] = useState('choose'); // choose | confirm
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState(() => localInputValue(Date.now() + 60 * 60 * 1000));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  // TikTok choices: nothing pre-selected, as TikTok requires.
  const [tt, setTt] = useState({ privacy: '', allowComment: false, allowDuet: false, allowStitch: false, disclose: false, yourBrand: false, brandedContent: false });
  const [duration, setDuration] = useState(null);

  const length = platform === 'x' ? xLength(caption) : caption.length;
  const tooLong = length > maxChars;

  const needsApproval = useMemo(() => {
    if (!approveEdits) return false;
    if (approved && normalise(approvedCaption) === normalise(caption)) return false;
    return normalise(draft) !== normalise(caption);
  }, [approveEdits, approved, approvedCaption, draft, caption]);

  const chosen = files.find((f) => f.id === fileId);
  const tooLongVideo = platform === 'tiktok' && tiktok?.maxSeconds && duration && duration > tiktok.maxSeconds;
  const ttReady = platform !== 'tiktok' || (
    tt.privacy && (!tt.disclose || tt.yourBrand || tt.brandedContent) && !(tt.brandedContent && tt.privacy === 'SELF_ONLY') && !tooLongVideo
  );
  const canPostFromPipp = files.length > 0 && !(platform === 'tiktok' && tiktok?.error);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    const result = await fn().catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if (result?.error) setError(result.error);
    return result;
  }

  if (status === 'scheduled') {
    const local = new Date(scheduledFor).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return (
      <section className="card">
        <h2>Scheduled for {local}</h2>
        <p>pipp posts it to @{username} on {platformLabel} automatically, within about 5 minutes of that time.</p>
        <p className="pre caption-box">{initialCaption}</p>
        <button
          type="button"
          className="button button-small"
          disabled={!!busy}
          onClick={async () => { const r = await run('cancel', () => cancelSchedule(offerId)); if (r?.ok) router.refresh(); }}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Change time or caption'}
        </button>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
    );
  }

  const noFilesReason = platform === 'tiktok'
    ? (tiktok?.error ? `TikTok: ${tiktok.error}.` : 'TikTok posts from pipp need a video, and this campaign has none. You can still accept and post it yourself.')
    : null;

  return (
    <section className="offer-actions">
      <div className="row row-between">
        <label htmlFor="caption"><strong>{approved ? 'Approved caption' : 'Suggested caption'}</strong></label>
        {status === 'sent' && (
          <button
            type="button"
            className="button button-small"
            disabled={!!busy}
            onClick={async () => { const r = await run('draft', () => newDraft(offerId)); if (r?.draft) setCaption(r.draft); }}
          >
            {busy === 'draft' ? 'Drafting…' : 'Try another'}
          </button>
        )}
      </div>
      <textarea id="caption" className="caption-input" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={platform === 'x' ? 25000 : 2200} aria-describedby={platform === 'x' ? 'caption-count' : undefined} />
      {platform === 'x' && (
        <span id="caption-count" className={`small ${tooLong ? 'is-error' : ''}`}>
          {length} of {maxChars} characters (links count as 23){tooLong ? ' · too long for X' : ''}
        </span>
      )}
      <span className="small">
        {approved ? `${clientName} approved this wording. Changing it sends it back for approval.` : "Drafted from your recent posts and the client's brief. Edit anything."}
      </span>
      {!/#ad\b/i.test(caption) && (
        <div className="tip">
          <span><strong>Suggestion:</strong> this is a paid post, so it's usually best to say so.</span>
          <button type="button" className="link-button" onClick={() => setCaption((c) => `${c.trim()} #ad`)}>Add #ad</button>
        </div>
      )}

      {needsApproval ? (
        <div className="choices">
          <button
            type="button"
            className="button"
            disabled={!!busy || !caption.trim() || tooLong}
            onClick={async () => { const r = await run('review', () => requestApproval(offerId, caption)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'review' ? 'Sending…' : `Send to ${clientName} for approval`}
          </button>
          <span className="small">You changed the wording, so {clientName} approves it before you post. Unchanged drafts skip this step.</span>
        </div>
      ) : mode === 'choose' ? (
        <div className="choices">
          <button type="button" className="button" disabled={!!busy || !canPostFromPipp || !caption.trim() || tooLong} onClick={() => setMode('confirm')}>
            Post from pipp
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!!busy || !caption.trim()}
            onClick={async () => { const r = await run('self', () => acceptSelf(offerId, caption)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'self' ? 'Saving…' : 'Accept and post it myself'}
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!caption.trim()}
            onClick={async () => {
              try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
            }}
          >
            {copied ? 'Caption copied' : 'Copy caption'}
          </button>
          <button
            type="button"
            className="link-button"
            disabled={!!busy}
            onClick={async () => { const r = await run('decline', () => declineOffer(offerId)); if (r?.ok) router.refresh(); }}
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
          {!canPostFromPipp && noFilesReason && <span className="small">{noFilesReason}</span>}
        </div>
      ) : (
        <div className="review">
          <h2>Post this to {platform === 'tiktok' && tiktok?.nickname ? tiktok.nickname : `@${username}`} on {platformLabel}?</h2>
          {canMulti && (
            <fieldset className="when">
              <legend>Post as</legend>
              <label><input type="radio" name="kind" checked={kind === 'carousel'} onChange={() => setKind('carousel')} /> {rules.multiName === 'carousel' ? 'Carousel' : 'Photo set'} of {multiFiles.length} {rules.photosOnly ? 'photos' : 'files'}, in order</label>
              <label><input type="radio" name="kind" checked={kind === 'single'} onChange={() => setKind('single')} /> One file</label>
            </fieldset>
          )}
          {kind === 'carousel' && canMulti ? (
            <>
              <ol className="slides">
                {multiFiles.map((f) => (
                  <li key={f.id}>
                    <span className="slide-n">{f.n}</span>
                    {f.url ? (f.isVideo ? <video src={f.url} muted preload="metadata" /> : <img src={f.url} alt={f.filename} />) : <span>{f.filename}</span>}
                  </li>
                ))}
              </ol>
              <p className="small">
                {platform === 'x'
                  ? `Photos post in this order. X allows up to 4 photos per post${files.some((f) => f.isVideo) ? ' and no videos alongside them' : ''}.`
                  : `Slides post in this order. Photos are cropped to match the first photo's shape, as Instagram requires.${files.length > 10 ? ' Instagram allows 10 slides, so only the first 10 are used.' : ''}`}
              </p>
            </>
          ) : (
            <>
              {files.length > 1 && (
                <div className="row" role="radiogroup" aria-label="File to post">
                  {files.map((f) => (
                    <label key={f.id} className={`photo-pick ${fileId === f.id ? 'is-on' : ''}`}>
                      <input type="radio" name="file" checked={fileId === f.id} onChange={() => { setFileId(f.id); setDuration(null); }} />
                      {f.url ? (f.isVideo ? <video src={f.url} muted preload="metadata" /> : <img src={f.url} alt={f.filename} />) : f.filename}
                    </label>
                  ))}
                </div>
              )}
              {chosen?.url && (chosen.isVideo
                ? <video className="review-img" src={chosen.url} controls preload="metadata" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
                : files.length === 1 && <img className="review-img" src={chosen.url} alt={chosen.filename} />)}
              {platform === 'instagram' && chosen?.isVideo && <p className="small">Videos post as Reels and also appear on your grid.</p>}
            </>
          )}
          <p className="review-caption">{caption}</p>

          {platform === 'tiktok' && tiktok && !tiktok.error && (
            <div className="tiktok-settings">
              <label htmlFor="tt-privacy"><strong>Who can see this video</strong></label>
              <select id="tt-privacy" value={tt.privacy} onChange={(e) => setTt({ ...tt, privacy: e.target.value })} required>
                <option value="" disabled>Choose…</option>
                {tiktok.privacyOptions.map((p) => (
                  <option key={p} value={p} disabled={tt.brandedContent && p === 'SELF_ONLY'}>
                    {PRIVACY_LABELS[p] || p}{tt.brandedContent && p === 'SELF_ONLY' ? ' (not allowed for branded content)' : ''}
                  </option>
                ))}
              </select>

              <fieldset className="when">
                <legend>Allow viewers to</legend>
                <label><input type="checkbox" checked={tt.allowComment} disabled={tiktok.commentDisabled} onChange={(e) => setTt({ ...tt, allowComment: e.target.checked })} /> Comment{tiktok.commentDisabled ? ' (off in your TikTok settings)' : ''}</label>
                <label><input type="checkbox" checked={tt.allowDuet} disabled={tiktok.duetDisabled} onChange={(e) => setTt({ ...tt, allowDuet: e.target.checked })} /> Duet{tiktok.duetDisabled ? ' (off in your TikTok settings)' : ''}</label>
                <label><input type="checkbox" checked={tt.allowStitch} disabled={tiktok.stitchDisabled} onChange={(e) => setTt({ ...tt, allowStitch: e.target.checked })} /> Stitch{tiktok.stitchDisabled ? ' (off in your TikTok settings)' : ''}</label>
              </fieldset>

              <label className="check">
                <input type="checkbox" checked={tt.disclose} onChange={(e) => setTt({ ...tt, disclose: e.target.checked, yourBrand: false, brandedContent: false })} />
                <span><strong>Disclose post content</strong><br /><span className="muted">This is a paid campaign, so turning this on and choosing “Branded content” is usually right.</span></span>
              </label>
              {tt.disclose && (
                <fieldset className="when">
                  <legend>This video promotes</legend>
                  <label><input type="checkbox" checked={tt.yourBrand} onChange={(e) => setTt({ ...tt, yourBrand: e.target.checked })} /> Your brand (you, or your own business)</label>
                  <label><input type="checkbox" checked={tt.brandedContent} onChange={(e) => setTt({ ...tt, brandedContent: e.target.checked, privacy: e.target.checked && tt.privacy === 'SELF_ONLY' ? '' : tt.privacy })} /> Branded content (a third party, like this client)</label>
                  {(tt.yourBrand || tt.brandedContent) && (
                    <p className="small">Your video will be labeled “{tt.brandedContent ? 'Paid partnership' : 'Promotional content'}”.</p>
                  )}
                  {!tt.yourBrand && !tt.brandedContent && <p className="small is-error">Choose at least one to disclose.</p>}
                </fieldset>
              )}
              {tooLongVideo && <p className="notice notice-error">This video is {Math.round(duration)} seconds; your TikTok allows {tiktok.maxSeconds}.</p>}
              <p className="small">
                By posting, you agree to TikTok’s{' '}
                {tt.brandedContent && <><a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and </>}
                <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.
                {' '}It can take a few minutes for the video to appear on your profile. Until TikTok finishes reviewing pipp, it will only be visible to you.
              </p>
            </div>
          )}

          <fieldset className="when">
            <legend>When</legend>
            <label><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /> Post now</label>
            <label><input type="radio" name="when" checked={when === 'later'} onChange={() => setWhen('later')} /> Schedule</label>
            {when === 'later' && (
              <input type="datetime-local" aria-label="Date and time to post" value={at} onChange={(e) => setAt(e.target.value)} />
            )}
          </fieldset>

          <div className="row">
            <button
              type="button"
              className="button"
              disabled={!!busy || (kind === 'single' && !fileId) || !ttReady}
              onClick={async () => {
                const iso = when === 'later' ? new Date(at).toISOString() : null;
                const selection = kind === 'carousel' && canMulti ? { kind: 'carousel' } : { kind: 'single', assetId: fileId };
                const options = platform === 'tiktok' ? { ...tt, consent: true } : null;
                const r = await run('publish', () => acceptAndPublish(offerId, selection, caption, iso, options));
                if (r?.processing) setNotice(`${platformLabel} is still processing. pipp finishes posting in the background and emails you when it’s live.`);
                if (r?.ok) router.refresh();
              }}
            >
              {busy === 'publish' ? (when === 'later' ? 'Scheduling…' : 'Publishing…') : when === 'later' ? 'Confirm schedule' : 'Confirm and publish'}
            </button>
            <button type="button" className="button button-small" disabled={!!busy} onClick={() => setMode('choose')}>Back</button>
          </div>
          <p className="small">
            {when === 'later'
              ? 'pipp posts it automatically within about 5 minutes of the time you pick, in your own time zone.'
              : platform === 'instagram'
                ? 'This posts publicly to your Instagram straight away. Photos outside 4:5 to 1.91:1 are cropped to fit.'
                : platform === 'x'
                  ? 'This posts to your X account straight away. Photos post uncropped.'
                  : 'This sends the video to your TikTok with the settings above.'}
          </p>
        </div>
      )}

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </section>
  );
}
