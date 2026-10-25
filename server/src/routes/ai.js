const r = require('express').Router(); const { z } = require('zod');
const { AiCommand, Test, Assignment, Material, Enrollment } = require('../models');
const { auth, role, wrap, ownsCourse, notifyMany, audit } = require('../kernel/auth');
const { runAI } = require('../kernel/ai'); const P = require('../kernel/prompts'); const L = require('../services/logic');
const KINDS = { tests: Test, assignments: Assignment, materials: Material };

r.post('/command', auth, role('teacher'), wrap(async (req, res) => {
  const { text, courseId } = z.object({ text: z.string().min(5).max(1000), courseId: z.string() }).parse(req.body);
  const c = await ownsCourse(courseId, req.user); if (!c) return res.status(403).json({ error: 'Forbidden' });
  const cmd = await AiCommand.create({ teacher: req.user._id, course: c._id, text });
  cmd.blueprint = await runAI({ task: 'blueprint', system: P.BLUEPRINT_SYSTEM, prompt: P.blueprintPrompt(text, c.title), validate: L.validateBlueprint, linkedId: cmd._id });
  await cmd.save(); res.json(cmd);
}));
r.put('/commands/:id/blueprint', auth, role('teacher'), wrap(async (req, res) => {
  const cmd = await AiCommand.findOne({ _id: req.params.id, teacher: req.user._id }); if (!cmd) return res.status(404).json({ error: 'Not found' });
  if (cmd.artifactId) return res.status(409).json({ error: 'Already generated. Send a new command to try again.' });
  cmd.blueprint = L.validateBlueprint(req.body.blueprint || {}); await cmd.save(); res.json(cmd);
}));
r.post('/commands/:id/approve', auth, role('teacher'), wrap(async (req, res) => {
  let cmd = await AiCommand.findOne({ _id: req.params.id, teacher: req.user._id }); if (!cmd) return res.status(404).json({ error: 'Not found' });
  if (cmd.artifactId) return res.json({ command: cmd, kind: cmd.artifactKind, artifact: await KINDS[cmd.artifactKind].findById(cmd.artifactId) }); // double click: same draft
  cmd = await AiCommand.findOneAndUpdate({ _id: cmd._id, generating: { $ne: true } }, { $set: { generating: true } }, { new: true });
  if (!cmd) return res.status(409).json({ error: 'This command is already being generated' });
  try {
    const bp = cmd.blueprint; let doc, kind;
    if (bp.type === 'test') {
      const exp = L.expand(bp);
      const qs = await runAI({ task: 'generate_test', system: P.GEN_SYSTEM, prompt: P.testPrompt(bp, exp), validate: L.validateTest(exp), linkedId: cmd._id });
      doc = await Test.create({ course: cmd.course, title: bp.title, durationMinutes: bp.durationMinutes, totalMarks: bp.totalMarks, questions: qs, createdByAI: true }); kind = 'tests';
    } else if (bp.type === 'assignment') {
      const j = await runAI({ task: 'generate_assignment', system: P.GEN_SYSTEM, prompt: P.assignmentPrompt(bp), linkedId: cmd._id,
        validate: (x) => { if (!x.instructions || !L.critOk(x.criteria, bp.totalMarks)) throw new Error('Bad assignment'); return x; } });
      doc = await Assignment.create({ course: cmd.course, title: j.title || bp.title, instructions: j.instructions, maxMarks: bp.totalMarks,
        dueAt: new Date(Date.now() + 7 * 864e5), contract: { modelAnswer: j.modelAnswer, criteria: j.criteria }, createdByAI: true }); kind = 'assignments';
    } else {
      const j = await runAI({ task: 'generate_material', system: P.GEN_SYSTEM, prompt: P.materialPrompt(bp), linkedId: cmd._id, validate: (x) => { if (!x.content) throw new Error('Empty'); return x; } });
      doc = await Material.create({ course: cmd.course, title: j.title || bp.title, content: j.content, status: 'draft', createdByAI: true }); kind = 'materials';
    }
    cmd.artifactKind = kind; cmd.artifactId = doc._id; cmd.generating = false; await cmd.save();
    await audit(req.user._id, 'ai_generate', doc._id, { kind });
    res.json({ command: cmd, kind, artifact: doc });
  } catch (e) { await AiCommand.updateOne({ _id: cmd._id }, { $set: { generating: false } }); throw e; }
}));
r.get('/commands', auth, role('teacher'), wrap(async (req, res) => res.json(await AiCommand.find({ teacher: req.user._id }).sort('-createdAt').limit(15))));
const load = async (req) => {
  const M = KINDS[req.params.kind]; if (!M) return null;
  const d = await M.findById(req.params.id); if (!d || !(await ownsCourse(d.course, req.user))) return null; return d;
};
r.get('/artifacts/:kind/:id', auth, role('teacher'), wrap(async (req, res) => { const d = await load(req); d ? res.json(d) : res.status(404).json({ error: 'Not found' }); }));
r.patch('/artifacts/:kind/:id', auth, role('teacher'), wrap(async (req, res) => {
  const d = await load(req); if (!d) return res.status(404).json({ error: 'Not found' });
  for (const k of ['title', 'instructions', 'content', 'durationMinutes', 'opensAt', 'closesAt', 'dueAt']) if (req.body[k] !== undefined && k in d.schema.paths) d[k] = req.body[k];
  await d.save(); res.json(d);
}));
r.post('/artifacts/:kind/:id/publish', auth, role('teacher'), wrap(async (req, res) => {
  const d = await load(req); if (!d) return res.status(404).json({ error: 'Not found' });
  if (d.status === 'published') return res.json(d); // second click does not notify everyone again
  d.status = 'published'; await d.save(); await audit(req.user._id, 'publish', d._id, { kind: req.params.kind });
  const en = await Enrollment.find({ course: d.course }).select('student');
  await notifyMany(en.map((e) => e.student), `New ${req.params.kind.slice(0, -1)} published: ${d.title}`);
  res.json(d);
}));
module.exports = r;
