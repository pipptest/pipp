// Drafts captions in a page's own voice using Claude.
// Docs: https://docs.claude.com/en/api/messages

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const SYSTEM = `You write Instagram captions for music and culture pages that post paid campaigns.

Your job is to sound exactly like the page you are writing for. Study its recent captions and copy its habits:
length, capitalisation, punctuation, sentence structure, emoji use, hashtag use, how it names artists and titles,
and its overall tone (news-wire, hype, casual, etc).

Rules:
- Use only facts from the brief. Never invent dates, titles, quotes, numbers or links.
- If the brief asks for tags or a link, include them the way this page would.
- Do not add hashtags, emoji or exclamation marks unless the page uses them.
- Each option should be a genuinely different take, still in the page's voice.

Reply with JSON only, in this shape: {"captions": ["option 1", "option 2", "option 3"]}`;

export function buildPrompt({ username, captions, brief, extras }) {
  const examples = captions.length
    ? captions.map((c, i) => `${i + 1}. ${c}`).join('\n\n')
    : '(This page has no captioned posts yet. Write in a clean, neutral style.)';
  return [
    `Page: @${username}`,
    `Recent captions from this page, newest first:\n${examples}`,
    `Campaign brief from the client:\n${brief}`,
    extras ? `Tags, handles or link to include:\n${extras}` : null,
    'Write 3 caption options for this page.',
  ].filter(Boolean).join('\n\n---\n\n');
}

export function parseCaptions(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The draft came back in an unexpected format.');
  const data = JSON.parse(text.slice(start, end + 1));
  const list = Array.isArray(data.captions) ? data.captions.filter((c) => typeof c === 'string' && c.trim()) : [];
  if (!list.length) throw new Error('No captions came back.');
  return list.slice(0, 3).map((c) => c.trim());
}

export async function draftCaptions(input) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude API error: ${body.error?.message || res.statusText}`);
  const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseCaptions(text);
}
