'use client';

import { useEffect, useState } from 'react';
import { prepareUpload, publishPost } from './actions';

const MAX_MB = 15;

export default function PublishForm({ username, initialCaption }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState(initialCaption || '');
  const [step, setStep] = useState('edit'); // edit | confirm | working | done
  const [error, setError] = useState(null);
  const [permalink, setPermalink] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function pick(e) {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Use a JPEG, PNG or WebP photo.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That photo is over ${MAX_MB} MB. Use a smaller one.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function publish() {
    setStep('working');
    setError(null);
    try {
      const prep = await prepareUpload(file.type);
      if (prep.error) throw new Error(prep.error);
      const put = await fetch(prep.url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('The photo upload failed. Try again.');
      const result = await publishPost({ path: prep.path, caption });
      if (result.error) throw new Error(result.error);
      setPermalink(result.permalink);
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('confirm');
    }
  }

  if (step === 'done') {
    return (
      <div aria-live="polite">
        <p className="notice">Posted to @{username}.</p>
        {permalink && <p><a className="button" href={permalink} target="_blank" rel="noreferrer">View the post on Instagram</a></p>}
        <p className="small"><a href="/account">Back to your page</a></p>
      </div>
    );
  }

  return (
    <>
      {step === 'edit' && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (file) setStep('confirm'); }}>
          <label htmlFor="photo">Photo</label>
          <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} required />
          <span className="small">JPEG, PNG or WebP. Photos taller than 4:5 or wider than 1.91:1 are cropped to fit Instagram.</span>
          <label htmlFor="caption">Caption</label>
          <textarea id="caption" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
          <button className="button" type="submit" disabled={!file}>Review post</button>
        </form>
      )}

      {(step === 'confirm' || step === 'working') && (
        <section className="review">
          <h2>Post this to @{username}?</h2>
          {preview && <img src={preview} alt="The photo you chose" className="review-img" />}
          <p className="review-caption">{caption || <em>No caption</em>}</p>
          <div className="row">
            <button className="button" type="button" onClick={publish} disabled={step === 'working'}>
              {step === 'working' ? 'Publishing…' : 'Confirm and publish'}
            </button>
            <button className="button button-small" type="button" onClick={() => setStep('edit')} disabled={step === 'working'}>
              Back
            </button>
          </div>
          <p className="small">This posts publicly to the real Instagram account straight away.</p>
        </section>
      )}

      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </>
  );
}
