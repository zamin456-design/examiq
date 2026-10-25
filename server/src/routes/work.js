const r = require('express').Router(); const multer = require('multer'), path = require('path'), fs = require('fs');
const { Course, Enrollment, Assignment, Submission, Test, Attempt, Notification } = require('../models');
const { auth, role, wrap, ownsCourse, notify } = require('../kernel/auth');
const { enqueue } = require('../services/marking'); const L = require('../services/logic');
fs.mkdirSync('uploads', { recursive: true });
const ALLOWED = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];
const up = multer({ storage: multer.diskStorage({ destination: 'uploads', filename: (q, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (q, f, cb) => cb(null, ALLOWED.includes(path.extname(f.originalname).toLowerCase())) });
const enrolled = (course, student) => Enrollment.findOne({ course, student });
// Short-lived cache: during an exam thousands of autosaves would otherwise re-read the same test each time.
const cache = new Map();
const getTest = async (id) => { const k = String(id), c = cache.get(k); if (c && c.exp > Date.now()) return c.t; const t = await Test.findById(id).lean(); if (t) { if (cache.size > 500) cache.clear(); cache.set(k, { t, exp: Date.now() + 30000 }); } return t; };

r.post('/assignments/:id/submit', auth, role('student'), up.single('file'), wrap(async (req, res) => {
  const a = await Assignment.findById(req.params.id);
  if (!a || a.status !== 'published') return res.status(404).json({ error: 'Assignment not found' });
  if (!(await enrolled(a.course, req.user._id))) return res.status(403).json({ error: 'Forbidden' });
  if (a.dueAt && Date.now() > a.dueAt) return res.status(403).json({ error: 'The deadline has passed' });
  const text = String(req.body.text || '').slice(0, 8000);
  if (!text.trim() && !req.file) return res.status(400).json({ error: 'Write an answer or attach a file (pdf, txt, png, jpg)' });
  const s = await Submission.findOneAndUpdate({ assignment: a._id, student: req.user._id },
    { text, ...(req.file ? { fileUrl: '/uploads/' + req.file.filename } : {}), status: 'marking', aiResult: null, finalMarks: null },
    { upsert: true, new: true, setDefaultsOnInsert: true });
  enqueue('submission', s._id, s.updatedAt.getTime());
  res.json({ ok: true });
}));
// Files are only served to the owner, the course teacher or an admin (no public links).
r.get('/files/:name', auth, wrap(async (req, res) => {
  const name = path.basename(req.params.name); const s = await Submission.findOne({ fileUrl: '/uploads/' + name });
  if (!s) return res.status(404).json({ error: 'Not found' });
  const a = await Assignment.findById(s.assignment);
  if (String(s.student) !== String(req.user._id) && !(await ownsCourse(a.course, req.user))) return res.status(403).json({ error: 'Forbidden' });
  res.sendFile(path.resolve('uploads', name));
}));

r.post('/tests/:id/start', auth, role('student'), wrap(async (req, res) => {
  const t = await Test.findById(req.params.id).lean();
  if (!t || t.status !== 'published') return res.status(404).json({ error: 'Test not found' });
  if (!(await enrolled(t.course, req.user._id))) return res.status(403).json({ error: 'Forbidden' });
  let a = await Attempt.findOne({ test: t._id, student: req.user._id });
  if (a && a.status !== 'in_progress') return res.status(409).json({ error: 'You have already submitted this test' });
  if (!a) {
    const now = Date.now();
    if ((t.opensAt && now < t.opensAt) || (t.closesAt && now > t.closesAt)) return res.status(403).json({ error: 'This test is not open right now' });
    const ids = t.questions.map((q) => q.id); if (t.shuffle) ids.sort(() => Math.random() - 0.5);
    try { a = await Attempt.create({ test: t._id, student: req.user._id, startedAt: new Date(), order: ids }); }
    catch (e) { if (e.code !== 11000) throw e; a = await Attempt.findOne({ test: t._id, student: req.user._id }); } // double click: use the one just created
  }
  // The server sends time LEFT, so a wrong clock on the student's device cannot stretch or shrink the exam.
  const remainingMs = Math.max(0, a.startedAt.getTime() + t.durationMinutes * 60000 - Date.now());
  res.json({ attempt: { _id: a._id, answers: a.answers }, remainingMs, test: L.safeTest(t, a.order) });
}));
// Batch autosave: one write can save many answers. Each answer is its own field, so saves never overwrite each other.
r.patch('/attempts/:id/answers', auth, role('student'), wrap(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, student: req.user._id }).select('test startedAt status');
  if (!a || a.status !== 'in_progress') return res.status(409).json({ error: 'This attempt is closed' });
  const t = await getTest(a.test);
  if (!L.withinTime(a.startedAt, t.durationMinutes, Date.now())) return res.status(409).json({ error: 'Time is over' });
  const set = L.sanitizeAnswers(t, req.body.answers);
  if (Object.keys(set).length) { const u = await Attempt.updateOne({ _id: a._id, status: 'in_progress' }, { $set: set }); if (!u.matchedCount) return res.status(409).json({ error: 'This attempt is closed' }); }
  res.json({ ok: true, saved: Object.keys(set).length });
}));
r.post('/attempts/:id/flag', auth, role('student'), wrap(async (req, res) => {
  await Attempt.updateOne({ _id: req.params.id, student: req.user._id, status: 'in_progress', 'flags.50': { $exists: false } }, { $push: { flags: { type: String(req.body.type).slice(0, 30), at: new Date() } } });
  res.json({ ok: true });
}));
r.post('/attempts/:id/submit', auth, role('student'), wrap(async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, student: req.user._id });
  if (!a || a.status !== 'in_progress') return res.status(409).json({ error: 'Already submitted' });
  const t = await getTest(a.test); const answers = { ...a.answers };
  // Final answers sent with the submit button are accepted only within a 30 second grace window.
  if (req.body.answers && L.withinTime(a.startedAt, t.durationMinutes, Date.now(), 30000)) for (const [k, v] of Object.entries(L.sanitizeAnswers(t, req.body.answers))) answers[k.slice(8)] = v;
  const results = L.autoMark(t, answers); const short = t.questions.some((q) => q.type === 'short');
  const $set = { answers, results, status: short ? 'marking' : 'final' }; if (!short) $set.finalScore = L.sum(results.map((x) => x.awarded));
  const done = await Attempt.findOneAndUpdate({ _id: a._id, status: 'in_progress' }, { $set }, { new: true }); // only one submit can win
  if (!done) return res.status(409).json({ error: 'Already submitted' });
  if (short) enqueue('attempt', a._id); else await notify(req.user._id, `Your result for "${t.title}" is ready.`);
  res.json({ status: done.status });
}));
r.get('/attempts/:id', auth, wrap(async (req, res) => {
  const a = await Attempt.findById(req.params.id).populate('test'); if (!a) return res.status(404).json({ error: 'Not found' });
  const mine = String(a.student) === String(req.user._id);
  if (!mine && !(await ownsCourse(a.test.course, req.user))) return res.status(403).json({ error: 'Forbidden' });
  if (mine && a.status !== 'final') return res.json({ status: a.status });
  res.json({ status: a.status, finalScore: a.finalScore, total: a.test.totalMarks, flags: a.flags,
    results: a.results.map((x) => ({ ...x, question: (a.test.questions.find((q) => q.id === x.qid) || {}).text })) });
}));
r.get('/results/me', auth, role('student'), wrap(async (req, res) => {
  const attempts = (await Attempt.find({ student: req.user._id }).populate('test', 'title totalMarks').sort('-createdAt'))
    .map((a) => ({ _id: a._id, title: a.test && a.test.title, total: a.test && a.test.totalMarks, status: a.status, finalScore: a.status === 'final' ? a.finalScore : null }));
  const subs = (await Submission.find({ student: req.user._id }).populate('assignment', 'title maxMarks').sort('-createdAt'))
    .map((s) => ({ _id: s._id, title: s.assignment && s.assignment.title, total: s.assignment && s.assignment.maxMarks, status: s.status === 'final' ? 'final' : 'marking',
      finalScore: s.status === 'final' ? s.finalMarks : null, feedback: s.status === 'final' && s.aiResult ? s.aiResult.feedback : null, comment: s.status === 'final' ? s.teacherComment : null }));
  res.json({ attempts, subs });
}));
r.get('/student/upcoming', auth, role('student'), wrap(async (req, res) => {
  const cids = (await Enrollment.find({ student: req.user._id })).map((e) => e.course); const now = new Date();
  const [as, ts, subs, ats] = await Promise.all([
    Assignment.find({ course: { $in: cids }, status: 'published', dueAt: { $gt: now } }).select('title dueAt course'),
    Test.find({ course: { $in: cids }, status: 'published' }).select('title closesAt durationMinutes course'),
    Submission.find({ student: req.user._id }).select('assignment'), Attempt.find({ student: req.user._id }).select('test status') ]);
  const done = new Set(subs.map((s) => String(s.assignment))), taken = new Set(ats.map((a) => String(a.test)));
  res.json({ courses: cids.length, results: ats.filter((a) => a.status === 'final').length,
    assignments: as.filter((a) => !done.has(String(a._id))), tests: ts.filter((t) => !taken.has(String(t._id)) && (!t.closesAt || t.closesAt > now)) });
}));
r.get('/notifications', auth, wrap(async (req, res) => res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(30))));
r.post('/notifications/read', auth, wrap(async (req, res) => { await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() }); res.json({ ok: true }); }));
module.exports = r;
