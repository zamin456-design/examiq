// Full API test with a real (in-memory) MongoDB. NOT run in the build sandbox (no network). Run it yourself:
//   npm i -D supertest mongodb-memory-server   then   npm test
const test = require('node:test'); const assert = require('node:assert/strict');
let request, MongoMemoryServer; try { request = require('supertest'); ({ MongoMemoryServer } = require('mongodb-memory-server')); } catch {}
test('API integration', { skip: !request && 'install supertest and mongodb-memory-server' }, async () => {
  process.env.JWT_SECRET = 'x'.repeat(32); process.env.DISABLE_RATE_LIMIT = '1';
  const mongoose = require('mongoose'); const bcrypt = require('bcryptjs'); const mem = await MongoMemoryServer.create(); await mongoose.connect(mem.getUri());
  const app = require('../src/index'); const M = require('../src/models'); const api = request(app);
  const reg = (name, email, role) => api.post('/api/v1/auth/register').send({ name, email, password: 'password123', role });
  const login = async (email) => (await api.post('/api/v1/auth/login').send({ email, password: 'password123' })).body.token;
  const H = (t) => ({ Authorization: 'Bearer ' + t });
  await M.User.create({ name: 'Admin', email: 'a@x.io', passwordHash: await bcrypt.hash('password123', 10), role: 'admin' });
  const tReg = await reg('Teach', 't@x.io', 'teacher'); assert.equal(tReg.body.pending, true);
  assert.equal((await api.post('/api/v1/auth/login').send({ email: 't@x.io', password: 'password123' })).status, 403); // not approved yet
  const admin = await login('a@x.io');
  const pendingTeachers = await api.get('/api/v1/admin/pending-teachers').set(H(admin));
  assert.equal(pendingTeachers.status, 200);
  assert.deepEqual(pendingTeachers.body.map((u) => u.email), ['t@x.io']);
  assert.equal(pendingTeachers.body[0].status, 'pending');
  assert.equal(JSON.stringify(pendingTeachers.body).includes('passwordHash'), false);
  const adminUsers = await api.get('/api/v1/admin/users').set(H(admin));
  assert.equal(adminUsers.status, 200);
  assert.ok(adminUsers.body.some((u) => u.email === 't@x.io' && u.status === 'pending'));
  assert.equal((await api.get('/api/v1/admin/stats').set(H(admin))).status, 200);
  const tUser = await M.User.findOne({ email: 't@x.io' });
  assert.equal((await api.patch('/api/v1/admin/users/' + tUser._id).set(H(admin)).send({ status: 'active' })).status, 200);
  const teacher = await login('t@x.io');
  const deniedAdminList = await api.get('/api/v1/admin/users').set(H(teacher));
  assert.equal(deniedAdminList.status, 403);
  assert.match(deniedAdminList.body.error, /Required role: admin; current role: teacher/);
  const other = (await reg('Other', 'o@x.io', 'teacher'), await M.User.updateOne({ email: 'o@x.io' }, { status: 'active' }), await login('o@x.io'));
  const course = (await api.post('/api/v1/courses').set(H(teacher)).send({ title: 'Bio' })).body;
  const stu = (await reg('Stu', 's@x.io', 'student')).body.token;
  const secondStudent = await reg('Second Student', 's2@x.io', 'student');
  assert.equal(secondStudent.status, 201);
  assert.equal((await reg('Duplicate Student', ' S2@X.IO ', 'student')).status, 409);
  const duplicateRace = await Promise.all([reg('Race Student', 'race@x.io', 'student'), reg('Race Student', 'race@x.io', 'student')]);
  assert.deepEqual(duplicateRace.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await api.post('/api/v1/courses/join').set(H(stu)).send({ joinCode: course.joinCode })).status, 200);
  assert.equal((await api.get('/api/v1/courses/' + course._id).set(H(other))).status, 403); // another teacher is blocked
  const t = await M.Test.create({ course: course._id, title: 'Quiz', durationMinutes: 30, totalMarks: 2, status: 'published', questions: [
    { id: 'q1', type: 'mcq', text: 'a', options: ['A', 'B', 'C', 'D'], correctIndex: 2, maxMarks: 1 }, { id: 'q2', type: 'mcq', text: 'b', options: ['A', 'B', 'C', 'D'], correctIndex: 0, maxMarks: 1 }] });
  const [s1, s2] = await Promise.all([api.post(`/api/v1/tests/${t._id}/start`).set(H(stu)), api.post(`/api/v1/tests/${t._id}/start`).set(H(stu))]); // double click
  assert.equal(s1.status, 200); assert.equal(s2.status, 200); assert.equal(s1.body.attempt._id, s2.body.attempt._id); assert.equal(await M.Attempt.countDocuments(), 1);
  assert.ok(!JSON.stringify(s1.body).includes('correctIndex'));
  const id = s1.body.attempt._id;
  await Promise.all(Array.from({ length: 40 }, (_, i) => api.patch(`/api/v1/attempts/${id}/answers`).set(H(stu)).send({ answers: { [i % 2 ? 'q1' : 'q2']: i % 2 ? 2 : 0 } })));
  const saved = await M.Attempt.findById(id); assert.equal(saved.answers.q1, 2); assert.equal(saved.answers.q2, 0); // no lost updates
  assert.equal((await api.patch(`/api/v1/attempts/${id}/answers`).set(H(stu)).send({ answers: { q9: 1 } })).status, 400);
  const subs = await Promise.all([api.post(`/api/v1/attempts/${id}/submit`).set(H(stu)).send({}), api.post(`/api/v1/attempts/${id}/submit`).set(H(stu)).send({})]);
  assert.deepEqual(subs.map((r) => r.status).sort(), [200, 409]); // only one submit wins
  assert.equal((await M.Attempt.findById(id)).finalScore, 2);
  await mongoose.disconnect(); await mem.stop();
});
