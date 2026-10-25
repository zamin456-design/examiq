const r = require('express').Router();
const { User, Test, Attempt, AiLog, AuditLog } = require('../models');
const { auth, role, wrap, audit } = require('../kernel/auth');
r.use(auth, role('admin'));
r.get('/pending-teachers', wrap(async (req, res) => res.json(await User.find({ role: 'teacher', status: 'pending' })
  .select('-passwordHash').sort('-createdAt'))));
r.get('/users', wrap(async (req, res) => res.json(await User.find().select('-passwordHash').sort('-createdAt').limit(200))));
r.patch('/users/:id', wrap(async (req, res) => {
  if (!['active', 'disabled'].includes(req.body.status)) return res.status(400).json({ error: 'Bad status' });
  const u = await User.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).select('-passwordHash');
  await audit(req.user._id, 'user_status', u?._id, { status: req.body.status }); res.json(u);
}));
r.get('/stats', wrap(async (req, res) => {
  const [users, pending, tests, marked, logs, ok, overrides] = await Promise.all([User.countDocuments(), User.countDocuments({ status: 'pending' }), Test.countDocuments({ createdByAI: true }),
    Attempt.countDocuments({ status: 'final' }), AiLog.countDocuments(), AiLog.countDocuments({ ok: true }), AuditLog.countDocuments({ action: 'mark_override' })]);
  const byModel = await AiLog.aggregate([{ $group: { _id: '$model', calls: { $sum: 1 }, ok: { $sum: { $cond: ['$ok', 1, 0] } }, ms: { $avg: '$ms' } } }]);
  res.json({ users, pending, testsGenerated: tests, attemptsMarked: marked, aiCalls: logs, aiSuccess: logs ? Math.round((ok / logs) * 100) : null, overrides, byModel, queue: require('../services/marking').queueStats() });
}));
r.get('/ai-logs', wrap(async (req, res) => res.json(await AiLog.find().sort('-createdAt').limit(30))));
r.get('/audit', wrap(async (req, res) => res.json(await AuditLog.find().sort('-createdAt').limit(40).populate('actor', 'name'))));
module.exports = r;
