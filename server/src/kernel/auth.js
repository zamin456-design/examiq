const jwt = require('jsonwebtoken');
const { User, Course, Enrollment, Notification, AuditLog } = require('../models');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const auth = async (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    const u = await User.findById(p.id).select('-passwordHash');
    if (!u || u.status !== 'active') return res.status(401).json({ error: 'Not allowed' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};
const role = (...r) => (req, res, next) => (r.includes(req.user.role) ? next() : res.status(403).json({
  error: `Access denied. Required role: ${r.join(' or ')}; current role: ${req.user.role}.`,
}));
// Ownership check: a teacher can only touch their own courses.
const ownsCourse = async (courseId, user) => {
  const c = await Course.findById(courseId);
  return c && (user.role === 'admin' || String(c.teacher) === String(user._id)) ? c : null;
};
const notify = (user, message) => Notification.create({ user, message }).catch(() => {});
const audit = (actor, action, target, meta) => AuditLog.create({ actor, action, target: String(target || ''), meta }).catch(() => {});
const notifyMany = (users, message) => (users.length ? Notification.insertMany(users.map((user) => ({ user, message }))).catch(() => {}) : Promise.resolve());
// Safe to call twice or at the same moment: a duplicate is ignored instead of crashing.
const enroll = async (course, student) => { try { await Enrollment.create({ course, student }); } catch (e) { if (e.code !== 11000) throw e; } };
module.exports = { wrap, auth, role, ownsCourse, notify, notifyMany, enroll, audit };
