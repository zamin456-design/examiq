require('dotenv').config();
const express = require('express'), mongoose = require('mongoose'), cors = require('cors'), helmet = require('helmet'), rl = require('express-rate-limit'), bcrypt = require('bcryptjs'), { ZodError } = require('zod');
const { User } = require('./models');
const { connectDb, friendly } = require('./kernel/mongoUri');
const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // set when deployed behind Render, Railway, Nginx, etc.
app.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
const api = express.Router();
if (!process.env.DISABLE_RATE_LIMIT) {
  api.use('/auth/login', rl({ windowMs: 15 * 60e3, limit: 30 }));
  api.use('/auth/register', rl({ windowMs: 60 * 60e3, limit: 30 }));
  api.use('/ai', rl({ windowMs: 60e3, limit: 15 }));
}
api.use('/auth', require('./routes/auth'));
api.use(require('./routes/courses'));
api.use('/ai', require('./routes/ai'));
api.use(require('./routes/work'));
api.use('/marking', require('./routes/marking'));
api.use(require('./routes/teacher'));
api.use('/admin', require('./routes/admin'));
app.use('/api/v1', api);
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join(', ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Bad id' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is too large (5 MB max)' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
});
async function start() {
  for (const k of ['MONGO_URI', 'JWT_SECRET']) if (!process.env[k]) { console.error('Missing env var: ' + k); process.exit(1); }
  await connectDb(mongoose, process.env.MONGO_URI);
  console.log('Database connected');
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (email && process.env.ADMIN_PASSWORD && !(await User.findOne({ email })))
    await User.create({ name: 'Admin', email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), role: 'admin' });
  const n = await require('./services/marking').recoverStuck(); if (n) console.log(`Re-queued ${n} unfinished marking job(s)`);
  const port = Number(process.env.PORT || 5000);
  await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log('ExamIQ API on port ' + port);
      resolve();
    });
    server.once('error', reject);
  });
}
module.exports = app;
if (require.main === module) start().catch((e) => { console.error('\nERROR: ' + friendly(e)); if (friendly(e) === String(e && e.message)) console.error(e); process.exit(1); });