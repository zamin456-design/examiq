const r = require('express').Router();
const { Course, Enrollment, Test, Attempt } = require('../models');
const { auth, role, wrap, ownsCourse } = require('../kernel/auth');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
async function courseStats(courseId) {
  const tests = await Test.find({ course: courseId });
  const attempts = await Attempt.find({ test: { $in: tests.map((t) => t._id) }, status: 'final' }).populate('student', 'name email');
  return { tests, attempts: attempts.filter((a) => a.student) };
}
r.get('/teacher/students', auth, role('teacher'), wrap(async (req, res) => {
  const cs = await Course.find({ teacher: req.user._id }); const out = {};
  for (const c of cs) {
    const en = await Enrollment.find({ course: c._id }).populate('student', 'name email');
    const { tests, attempts } = await courseStats(c._id);
    for (const e of en.filter((x) => x.student)) {
      const s = (out[e.student._id] ||= { id: e.student._id, name: e.student.name, email: e.student.email, courses: [], got: 0, max: 0 });
      s.courses.push(c.title);
      for (const a of attempts.filter((x) => String(x.student._id) === String(e.student._id))) { s.got += a.finalScore; s.max += tests.find((t) => String(t._id) === String(a.test)).totalMarks; }
    }
  }
  res.json(Object.values(out).map((s) => ({ id: s.id, name: s.name, email: s.email, courses: s.courses, average: pct(s.got, s.max) })));
}));
r.get('/analytics/course/:id', auth, role('teacher'), wrap(async (req, res) => {
  const c = await ownsCourse(req.params.id, req.user); if (!c) return res.status(403).json({ error: 'Forbidden' });
  const { tests, attempts } = await courseStats(c._id);
  res.json({ tests: tests.map((t) => { const a = attempts.filter((x) => String(x.test) === String(t._id));
    return { title: t.title, attempts: a.length, average: pct(a.reduce((s, x) => s + x.finalScore, 0), a.length * t.totalMarks),
      hardest: t.questions.map((q) => { const got = a.reduce((s, x) => s + (x.results.find((y) => y.qid === q.id)?.awarded || 0), 0); return { q: q.text, pct: pct(got, a.length * q.maxMarks) }; })
        .filter((x) => x.pct !== null).sort((p, q) => p.pct - q.pct).slice(0, 3) }; }) });
}));
r.get('/export/results/:id', auth, role('teacher'), wrap(async (req, res) => {
  const c = await ownsCourse(req.params.id, req.user); if (!c) return res.status(403).json({ error: 'Forbidden' });
  const { tests, attempts } = await courseStats(c._id);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = ['student,email,test,score,total', ...attempts.map((a) => [a.student.name, a.student.email, tests.find((t) => String(t._id) === String(a.test)).title, a.finalScore, tests.find((t) => String(t._id) === String(a.test)).totalMarks].map(q).join(','))];
  res.type('text/csv').send(rows.join('\n'));
}));
module.exports = r;
