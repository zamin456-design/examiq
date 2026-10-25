const fs = require('fs');
const { Attempt, Test, Submission, Assignment, Course } = require('../models');
const { runAI } = require('../kernel/ai');
const { MARK_SYSTEM, markBatchPrompt } = require('../kernel/prompts');
const { notify } = require('../kernel/auth');
const L = require('./logic'); const { createQueue } = require('./queue');
const CONF = 0.75; // below this the teacher must review before the student sees marks

async function aiMarkItems(items) {
  if (!items.length) return [];
  const j = await runAI({ task: 'mark', system: MARK_SYSTEM, prompt: markBatchPrompt(items), validate: (x) => { if (!x || !Array.isArray(x.marks)) throw new Error('No marks array'); return x; } });
  const by = Object.fromEntries(j.marks.map((m) => [String(m.id), m]));
  return items.map((it) => L.normalizeMark(it.q, by[it.q.id]));
}
async function finishAttempt(a, t, results) {
  const finalScore = L.sum(results.map((r) => r.awarded)); const sure = results.every((r) => r.confidence >= CONF);
  const r = await Attempt.updateOne({ _id: a._id, status: 'marking' }, { $set: { results, finalScore, status: sure ? 'final' : 'review' } });
  if (!r.modifiedCount) return;
  const c = await Course.findById(t.course);
  await notify(sure ? a.student : c.teacher, sure ? `Your result for "${t.title}" is ready.` : `A submission for "${t.title}" needs your review.`);
}
async function markAttempt(id, giveUp = false) {
  const a = await Attempt.findById(id); if (!a || a.status !== 'marking') return;
  const t = await Test.findById(a.test); const results = L.autoMark(t, a.answers); const items = [];
  for (const q of t.questions.filter((x) => x.type === 'short')) {
    const ans = a.answers[q.id];
    if (!ans || !String(ans).trim()) results.push({ qid: q.id, ...L.blankResult(q) }); else items.push({ q, answer: ans });
  }
  const marked = giveUp ? items.map((it) => L.failedResult(it.q)) : await aiMarkItems(items); // throws -> queue retries
  items.forEach((it, i) => results.push({ qid: it.q.id, ...marked[i] }));
  await finishAttempt(a, t, results);
}
async function fileText(url) {
  try { const p = '.' + url; if (url.endsWith('.txt')) return fs.readFileSync(p, 'utf8'); if (url.endsWith('.pdf')) return (await require('pdf-parse')(fs.readFileSync(p))).text; } catch {}
  return '';
}
async function markSubmission(id, giveUp = false) {
  const s = await Submission.findById(id); if (!s || s.status !== 'marking') return;
  const a = await Assignment.findById(s.assignment); const text = ((s.text || '') + '\n' + (s.fileUrl ? await fileText(s.fileUrl) : '')).trim();
  const q = { id: 'a1', text: a.title + ': ' + a.instructions, maxMarks: a.maxMarks, modelAnswer: a.contract && a.contract.modelAnswer, criteria: a.contract && a.contract.criteria };
  const r = !text ? { ...L.blankResult(q) } : giveUp ? L.failedResult(q) : (await aiMarkItems([{ q, answer: text }]))[0];
  const sure = r.confidence >= CONF;
  const u = await Submission.updateOne({ _id: s._id, status: 'marking', updatedAt: s.updatedAt }, { $set: { aiResult: r, status: sure ? 'final' : 'review', ...(sure ? { finalMarks: r.awarded } : {}) } });
  if (!u.modifiedCount) return; // student resubmitted meanwhile: the newer job handles it
  const c = await Course.findById(a.course);
  await notify(sure ? s.student : c.teacher, sure ? `"${a.title}" has been marked.` : `An assignment submission for "${a.title}" needs your review.`);
}
const queue = createQueue({ concurrency: +process.env.AI_CONCURRENCY || 3, rpm: +process.env.AI_RPM || 10, retries: 3, backoffMs: +process.env.AI_BACKOFF_MS || 5000,
  handler: (j) => (j.kind === 'attempt' ? markAttempt(j.id) : markSubmission(j.id)),
  onGiveUp: (j) => (j.kind === 'attempt' ? markAttempt(j.id, true) : markSubmission(j.id, true)) }); // after retries, send to the teacher instead of losing it
const enqueue = (kind, id, version = '') => queue.add({ kind, id: String(id) }, `${kind}:${id}:${version}`);
// After a restart, anything still "marking" is queued again.
async function recoverStuck() {
  const as = await Attempt.find({ status: 'marking' }).select('_id'); as.forEach((a) => enqueue('attempt', a._id));
  const ss = await Submission.find({ status: 'marking' }).select('_id updatedAt'); ss.forEach((s) => enqueue('submission', s._id, s.updatedAt.getTime()));
  return as.length + ss.length;
}
module.exports = { enqueue, recoverStuck, queueStats: queue.stats, markAttempt, markSubmission };
