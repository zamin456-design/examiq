const r = require('express').Router();
const { Course, Test, Attempt, Assignment, Submission } = require('../models');
const { auth, role, wrap, ownsCourse, notify, audit } = require('../kernel/auth');
r.use(auth, role('teacher'));
const sumOf = (a) => a.reduce((s, x) => s + x.awarded, 0);
r.get('/queue', wrap(async (req, res) => {
  const ids = (await Course.find({ teacher: req.user._id }).select('_id')).map((c) => c._id);
  const tests = await Test.find({ course: { $in: ids } }); const asg = await Assignment.find({ course: { $in: ids } });
  const attempts = await Attempt.find({ test: { $in: tests.map((t) => t._id) }, status: 'review' }).populate('student', 'name email');
  const subs = await Submission.find({ assignment: { $in: asg.map((a) => a._id) }, status: 'review' }).populate('student', 'name email');
  res.json({
    attempts: attempts.map((a) => { const t = tests.find((x) => String(x._id) === String(a.test));
      return { _id: a._id, student: a.student, test: t.title, flags: a.flags.length,
        items: a.results.map((x) => { const q = t.questions.find((y) => y.id === x.qid); return { ...x, question: q.text, type: q.type, answer: a.answers[x.qid] }; }) }; }),
    subs: subs.map((s) => { const a = asg.find((x) => String(x._id) === String(s.assignment));
      return { _id: s._id, student: s.student, assignment: a.title, max: a.maxMarks, text: s.text, fileUrl: s.fileUrl, ai: s.aiResult }; }) });
}));
const ownedAttempt = async (id, user) => {
  const a = await Attempt.findById(id); if (!a) return null; const t = await Test.findById(a.test);
  return (await ownsCourse(t.course, user)) ? { a, t } : null;
};
r.patch('/attempts/:id', wrap(async (req, res) => {
  const o = await ownedAttempt(req.params.id, req.user); if (!o) return res.status(404).json({ error: 'Not found' });
  if (!['review', 'final'].includes(o.a.status)) return res.status(409).json({ error: 'This attempt is still being marked' });
  const x = o.a.results.find((i) => i.qid === req.body.qid); if (!x) return res.status(404).json({ error: 'Question not found' });
  const n = Number(req.body.awarded); if (!(n >= 0 && n <= x.max)) return res.status(400).json({ error: `Marks must be between 0 and ${x.max}` });
  if (x.aiAwarded === undefined) x.aiAwarded = x.awarded; // keep the original AI mark
  x.awarded = n; x.source = 'teacher'; if (req.body.feedback) x.feedback = String(req.body.feedback).slice(0, 500);
  o.a.markModified('results'); if (o.a.status === 'final') o.a.finalScore = sumOf(o.a.results);
  await o.a.save(); await audit(req.user._id, 'mark_override', o.a._id, { qid: x.qid, from: x.aiAwarded, to: n }); res.json({ ok: true });
}));
r.post('/attempts/:id/approve', wrap(async (req, res) => {
  const o = await ownedAttempt(req.params.id, req.user); if (!o) return res.status(404).json({ error: 'Not found' });
  if (!['review', 'final'].includes(o.a.status)) return res.status(409).json({ error: 'This attempt is still being marked' });
  o.a.finalScore = sumOf(o.a.results); o.a.status = 'final'; await o.a.save();
  await audit(req.user._id, 'approve_attempt', o.a._id); await notify(o.a.student, `Your result for "${o.t.title}" is ready.`); res.json({ ok: true });
}));
const ownedSub = async (id, user) => {
  const s = await Submission.findById(id); if (!s) return null; const a = await Assignment.findById(s.assignment);
  return (await ownsCourse(a.course, user)) ? { s, a } : null;
};
r.patch('/submissions/:id', wrap(async (req, res) => {
  const o = await ownedSub(req.params.id, req.user); if (!o) return res.status(404).json({ error: 'Not found' });
  if (!['review', 'final'].includes(o.s.status)) return res.status(409).json({ error: 'This submission is still being marked' });
  const n = Number(req.body.marks); if (!(n >= 0 && n <= o.a.maxMarks)) return res.status(400).json({ error: `Marks must be between 0 and ${o.a.maxMarks}` });
  o.s.finalMarks = n; if (req.body.comment) o.s.teacherComment = String(req.body.comment).slice(0, 500);
  await o.s.save(); await audit(req.user._id, 'mark_override', o.s._id, { from: o.s.aiResult?.awarded, to: n }); res.json({ ok: true });
}));
r.post('/submissions/:id/approve', wrap(async (req, res) => {
  const o = await ownedSub(req.params.id, req.user); if (!o) return res.status(404).json({ error: 'Not found' });
  if (!['review', 'final'].includes(o.s.status)) return res.status(409).json({ error: 'This submission is still being marked' });
  if (o.s.finalMarks == null) o.s.finalMarks = o.s.aiResult?.awarded || 0;
  o.s.status = 'final'; await o.s.save(); await notify(o.s.student, `"${o.a.title}" has been marked.`); res.json({ ok: true });
}));
module.exports = r;
