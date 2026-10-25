const r = require('express').Router(); const { z } = require('zod');
const { Course, Enrollment, Material, Assignment, Test, Attempt, Submission, User } = require('../models');
const { auth, role, wrap, ownsCourse, notify, enroll } = require('../kernel/auth');
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
r.get('/courses', auth, wrap(async (req, res) => {
  const u = req.user; let cs;
  if (u.role === 'teacher') cs = await Course.find({ teacher: u._id });
  else if (u.role === 'admin') cs = await Course.find();
  else cs = await Course.find({ _id: { $in: (await Enrollment.find({ student: u._id })).map((e) => e.course) } });
  cs = await Course.populate(cs, { path: 'teacher', select: 'name' });
  const counts = await Enrollment.aggregate([{ $match: { course: { $in: cs.map((c) => c._id) } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]);
  const m = Object.fromEntries(counts.map((x) => [String(x._id), x.n]));
  res.json(cs.map((c) => ({ ...c.toObject(), studentCount: m[String(c._id)] || 0 })));
}));
r.post('/courses', auth, role('teacher'), wrap(async (req, res) => {
  const b = z.object({ title: z.string().min(2), description: z.string().optional() }).parse(req.body);
  res.status(201).json(await Course.create({ ...b, teacher: req.user._id, joinCode: code() }));
}));
r.post('/courses/join', auth, role('student'), wrap(async (req, res) => {
  const c = await Course.findOne({ joinCode: String(req.body.joinCode || '').trim().toUpperCase() });
  if (!c) return res.status(404).json({ error: 'No course has that code' });
  await enroll(c._id, req.user._id);
  res.json({ ok: true, course: c.title });
}));
r.get('/courses/:id', auth, wrap(async (req, res) => {
  const u = req.user; const c = await Course.findById(req.params.id).populate('teacher', 'name');
  if (!c) return res.status(404).json({ error: 'Course not found' });
  const teach = u.role === 'admin' || String(c.teacher._id) === String(u._id);
  if (!teach && !(await Enrollment.findOne({ course: c._id, student: u._id }))) return res.status(403).json({ error: 'Forbidden' });
  const f = teach ? { course: c._id } : { course: c._id, status: 'published' };
  const [materials, assignments, tests] = await Promise.all([
    Material.find(f), teach ? Assignment.find(f) : Assignment.find(f).select('-contract'),
    Test.find(f).select('title durationMinutes totalMarks opensAt closesAt status')]);
  let attempts = [], subs = [];
  if (!teach) {
    attempts = await Attempt.find({ student: u._id, test: { $in: tests.map((t) => t._id) } }).select('test status finalScore');
    subs = (await Submission.find({ student: u._id, assignment: { $in: assignments.map((a) => a._id) } }))
      .map((s) => (s.status === 'final' ? { assignment: s.assignment, status: 'final', finalMarks: s.finalMarks, feedback: s.aiResult?.feedback, teacherComment: s.teacherComment } : { assignment: s.assignment, status: 'marking' }));
  }
  res.json({ course: c, materials, assignments, tests, attempts, subs, isTeacher: teach });
}));
r.post('/courses/:id/enroll', auth, role('teacher'), wrap(async (req, res) => {
  const c = await ownsCourse(req.params.id, req.user); if (!c) return res.status(403).json({ error: 'Forbidden' });
  const s = await User.findOne({ email: String(req.body.email || '').toLowerCase(), role: 'student' });
  if (!s) return res.status(404).json({ error: 'No student has that email' });
  await enroll(c._id, s._id);
  await notify(s._id, `You were added to ${c.title}.`); res.json({ ok: true });
}));
r.post('/courses/:id/materials', auth, role('teacher'), wrap(async (req, res) => {
  const c = await ownsCourse(req.params.id, req.user); if (!c) return res.status(403).json({ error: 'Forbidden' });
  const b = z.object({ title: z.string().min(2), type: z.enum(['note', 'link']).default('note'), content: z.string().min(1) }).parse(req.body);
  res.status(201).json(await Material.create({ ...b, course: c._id, status: 'published' }));
}));
module.exports = r;
