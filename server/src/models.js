const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId, Mixed = Schema.Types.Mixed;
const ref = (m) => ({ type: ObjectId, ref: m });
// unique = one compound unique index; extra = other indexes that keep queries fast with many users
const mk = (name, def, unique, extra = []) => {
  const s = new Schema(def, { timestamps: true });
  if (unique) s.index(unique, { unique: true });
  extra.forEach((i) => s.index(i));
  return mongoose.model(name, s);
};
module.exports = {
  User: mk('User', { name: String, email: { type: String, unique: true, lowercase: true }, passwordHash: String,
    role: { type: String, enum: ['student', 'teacher', 'admin'] }, status: { type: String, enum: ['active', 'pending', 'disabled'], default: 'active' },
    institution: { type: String, default: 'default' } }, null, [{ role: 1, status: 1 }]),
  Course: mk('Course', { teacher: ref('User'), title: String, description: String, joinCode: { type: String, unique: true }, status: { type: String, default: 'active' } }, null, [{ teacher: 1 }]),
  Enrollment: mk('Enrollment', { course: ref('Course'), student: ref('User') }, { course: 1, student: 1 }, [{ student: 1 }]),
  Material: mk('Material', { course: ref('Course'), title: String, type: { type: String, default: 'note' }, content: String, status: { type: String, default: 'published' }, createdByAI: Boolean }, null, [{ course: 1, status: 1 }]),
  Assignment: mk('Assignment', { course: ref('Course'), title: String, instructions: String, dueAt: Date, maxMarks: Number, contract: Mixed, status: { type: String, default: 'draft' }, createdByAI: Boolean }, null, [{ course: 1, status: 1 }]),
  Submission: mk('Submission', { assignment: ref('Assignment'), student: ref('User'), text: String, fileUrl: String,
    status: { type: String, default: 'marking' }, aiResult: Mixed, finalMarks: Number, teacherComment: String }, { assignment: 1, student: 1 }, [{ assignment: 1, status: 1 }, { student: 1 }, { status: 1 }]),
  Test: mk('Test', { course: ref('Course'), title: String, durationMinutes: Number, totalMarks: Number, questions: [Mixed], shuffle: { type: Boolean, default: true },
    status: { type: String, default: 'draft' }, opensAt: Date, closesAt: Date, createdByAI: Boolean }, null, [{ course: 1, status: 1 }]),
  Attempt: mk('Attempt', { test: ref('Test'), student: ref('User'), startedAt: Date, order: [String], answers: { type: Mixed, default: {} },
    status: { type: String, default: 'in_progress' }, results: [Mixed], finalScore: Number, flags: [Mixed] }, { test: 1, student: 1 }, [{ test: 1, status: 1 }, { student: 1, status: 1 }, { status: 1 }]),
  AiCommand: mk('AiCommand', { teacher: ref('User'), course: ref('Course'), text: String, blueprint: Mixed, artifactKind: String, artifactId: ObjectId, generating: Boolean }, null, [{ teacher: 1, createdAt: -1 }]),
  AiLog: mk('AiLog', { task: String, model: String, ms: Number, ok: Boolean, error: String, linkedId: ObjectId }, null, [{ createdAt: -1 }]),
  Notification: mk('Notification', { user: ref('User'), message: String, readAt: Date }, null, [{ user: 1, createdAt: -1 }]),
  AuditLog: mk('AuditLog', { actor: ref('User'), action: String, target: String, meta: Mixed }, null, [{ createdAt: -1 }]),
};
