// AI Gateway: the ONLY place that talks to AI models. Primary + automatic fallback, JSON output, retries, logging.
const { AiLog } = require('../models');
const bad = (r, d, n) => Object.assign(new Error((d && d.error && d.error.message) || n), { rateLimited: r.status === 429 });
const clean = (t) => t.replace(/```json|```/g, '').trim();

async function gemini(system, prompt) {
  const m = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(40000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } }),
  });
  const d = await r.json();
  if (!r.ok) throw bad(r, d, 'Gemini error');
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('');
}
// OpenAI-compatible endpoint: works for Groq (default) and xAI Grok by changing the env vars.
async function second(system, prompt) {
  const base = process.env.SECOND_AI_BASE_URL || 'https://api.groq.com/openai/v1';
  const r = await fetch(base + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(40000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.SECOND_AI_KEY },
    body: JSON.stringify({ model: process.env.SECOND_AI_MODEL || 'openai/gpt-oss-120b', temperature: 0.3,
      response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw bad(r, d, 'Second model error');
  return d.choices?.[0]?.message?.content || '';
}
const providers = {
  gemini: { call: gemini, enabled: () => !!process.env.GEMINI_API_KEY },
  second: { call: second, enabled: () => !!process.env.SECOND_AI_KEY },
};

async function runAI({ task, system, prompt, validate = (x) => x, linkedId }) {
  const order = process.env.AI_PRIMARY === 'second' ? ['second', 'gemini'] : ['gemini', 'second'];
  let lastErr = new Error('No AI key configured');
  for (const key of order) {
    const p = providers[key];
    if (!p.enabled()) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const raw = await p.call(system + '\nReturn ONLY valid JSON.', prompt);
        const out = validate(JSON.parse(clean(raw)));
        await AiLog.create({ task, model: key, ms: Date.now() - t0, ok: true, linkedId });
        return out;
      } catch (e) {
        lastErr = e;
        await AiLog.create({ task, model: key, ms: Date.now() - t0, ok: false, error: String(e.message).slice(0, 200), linkedId }).catch(() => {});
        if (e.rateLimited) break; // waiting is better than hammering: try the other model now
      }
    }
  }
  throw Object.assign(new Error('AI is unavailable right now: ' + lastErr.message), { rateLimited: !!lastErr.rateLimited });
}
module.exports = { runAI };
