const r = require('express').Router();
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), { z } = require('zod');
const { User } = require('../models'); const { auth, wrap } = require('../kernel/auth');
const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });
r.post('/register', wrap(async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), password: z.string().min(8), role: z.enum(['student', 'teacher']) }).parse(req.body);
  if (await User.findOne({ email: b.email })) return res.status(409).json({ error: 'This email is already registered' });
  let u;
  try {
    u = await User.create({ name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, 10), role: b.role, status: b.role === 'teacher' ? 'pending' : 'active' });
  } catch (e) {
    if (e.code === 11000 && e.keyPattern && e.keyPattern.email) return res.status(409).json({ error: 'This email is already registered' });
    throw e;
  }
  if (u.status === 'pending') return res.status(201).json({ pending: true, message: 'Account created. An admin must approve teacher accounts before you can log in.' });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
r.post('/login', wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const u = await User.findOne({ email: email.toLowerCase() });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return res.status(401).json({ error: 'Wrong email or password' });
  if (u.status === 'pending') return res.status(403).json({ error: 'Waiting for admin approval' });
  if (u.status === 'disabled') return res.status(403).json({ error: 'This account is disabled' });
  res.json({ token: sign(u), user: pub(u) });
}));
r.get('/me', auth, (req, res) => res.json({ user: pub(req.user) }));
module.exports = r;
