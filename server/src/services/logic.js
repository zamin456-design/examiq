// Pure logic (no database, no network) so it can be unit tested exhaustively.
const sum = (a) => a.reduce((s, x) => s + x, 0);
const half = (n) => Math.round(n * 2) / 2;
const clamp = (n, lo, hi) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const MAX_ANSWER = 8000;

function validateBlueprint(b) {
  if (!b || typeof b !== 'object') throw bad('Bad blueprint');
  if (!['test', 'assignment', 'material'].includes(b.type)) throw bad('Unknown type');
  const o = { type: b.type, title: String(b.title || b.topic || 'Untitled').slice(0, 120), topic: String(b.topic || b.title || '').slice(0, 200),
    difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium',
    durationMinutes: Math.max(5, Math.min(240, Math.round(+b.durationMinutes || 30))), instructions: String(b.instructions || '').slice(0, 500) };
  if (b.type === 'test') {
    o.sections = (Array.isArray(b.sections) ? b.sections : []).slice(0, 4).map((s) => ({ questionType: s && s.questionType === 'short' ? 'short' : 'mcq',
      count: Math.max(1, Math.min(30, Math.round(+(s && s.count) || 1))), marksEach: half(Math.max(0.5, +(s && s.marksEach) || 1)) }));
    if (!o.sections.length) throw bad('A test needs at least one section');
    if (sum(o.sections.map((s) => s.count)) > 30) throw bad('A test can have at most 30 questions');
    o.totalMarks = sum(o.sections.map((s) => s.count * s.marksEach));
  } else o.totalMarks = half(Math.min(1000, Math.max(1, +b.totalMarks > 0 ? +b.totalMarks : 10)));
  return o;
}
const expand = (bp) => bp.sections.flatMap((s) => Array(s.count).fill({ type: s.questionType, marks: s.marksEach }));
const critOk = (c, max) => Array.isArray(c) && c.length > 0 && c.every((x) => x && Number.isFinite(+x.marks) && +x.marks >= 0) && Math.abs(sum(c.map((x) => +x.marks)) - max) < 0.01;
const validateTest = (expected) => (j) => {
  if (!j || !Array.isArray(j.questions) || j.questions.length !== expected.length) throw new Error('Wrong question count');
  return j.questions.map((q, i) => {
    const e = expected[i]; if (!q || !q.text) throw new Error('Missing text');
    const base = { id: 'q' + (i + 1), type: e.type, text: String(q.text), maxMarks: e.marks };
    if (e.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) throw new Error('Bad MCQ');
      if (new Set(q.options.map((o) => String(o).trim().toLowerCase())).size !== 4) throw new Error('Duplicate options');
      return { ...base, options: q.options.map(String), correctIndex: q.correctIndex };
    }
    if (!q.modelAnswer || !critOk(q.criteria, e.marks)) throw new Error('Bad short question');
    return { ...base, modelAnswer: String(q.modelAnswer), criteria: q.criteria.map((c) => ({ name: String(c.name), marks: +c.marks })) };
  });
};
// MCQ is marked by code: fast, exact, free.
function autoMark(test, answers) {
  answers = answers || {};
  return test.questions.filter((q) => q.type === 'mcq').map((q) => {
    const g = answers[q.id];
    const ok = (typeof g === 'number' || (typeof g === 'string' && g.trim() !== '')) && Number(g) === q.correctIndex;
    return { qid: q.id, awarded: ok ? q.maxMarks : 0, max: q.maxMarks, source: 'auto', confidence: 1, feedback: ok ? 'Correct.' : `Correct answer: ${q.options[q.correctIndex]}` };
  });
}
// Validates a batch of answers and returns a MongoDB $set so saves for different questions can never overwrite each other.
function sanitizeAnswers(test, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('answers must be an object');
  const byId = Object.fromEntries(test.questions.map((q) => [q.id, q])); const keys = Object.keys(input); const set = {};
  if (keys.length > test.questions.length) throw bad('Too many answers');
  for (const k of keys) {
    const q = byId[k]; if (!q) throw bad('Unknown question ' + k); const v = input[k];
    if (q.type === 'mcq') { if (v !== null && !(Number.isInteger(v) && v >= 0 && v < q.options.length)) throw bad('Bad option for ' + k); }
    else if (typeof v !== 'string') throw bad('Answer must be text for ' + k); else if (v.length > MAX_ANSWER) throw bad('Answer too long for ' + k);
    set['answers.' + k] = v;
  }
  return set;
}
const withinTime = (startedAt, minutes, now, graceMs = 10000) => now <= new Date(startedAt).getTime() + minutes * 60000 + graceMs;
const blankResult = (q) => ({ awarded: 0, max: q.maxMarks, feedback: 'No answer was given.', confidence: 1, source: 'auto' });
const failedResult = (q) => ({ awarded: 0, max: q.maxMarks, feedback: 'Could not be marked automatically. Your teacher will mark this.', confidence: 0, source: 'ai' });
// The code, never the AI, enforces the maximum. A missing or odd AI reply becomes "needs teacher".
function normalizeMark(q, m) {
  if (!m || typeof m !== 'object' || !(typeof m.awardedMarks === 'number' || (typeof m.awardedMarks === 'string' && m.awardedMarks.trim() !== '')) || !Number.isFinite(Number(m.awardedMarks))) return failedResult(q); // garbage marks go to the teacher, never to the student
  return { awarded: half(clamp(m.awardedMarks, 0, q.maxMarks)), max: q.maxMarks, feedback: String(m.feedback || '').slice(0, 500), confidence: clamp(m.confidence, 0, 1), source: 'ai' };
}
const safeTest = (t, order) => {
  const map = Object.fromEntries(t.questions.map((q) => [q.id, q])); const ids = order && order.length ? order : t.questions.map((q) => q.id);
  return { _id: t._id, title: t.title, durationMinutes: t.durationMinutes, totalMarks: t.totalMarks,
    questions: ids.map((i) => map[i]).filter(Boolean).map(({ correctIndex, modelAnswer, criteria, ...q }) => q) };
};
module.exports = { sum, half, clamp, validateBlueprint, expand, critOk, validateTest, autoMark, sanitizeAnswers, withinTime, blankResult, failedResult, normalizeMark, safeTest, MAX_ANSWER };
