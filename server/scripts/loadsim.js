// Load simulation of the parts that decide whether a big class works: per-student CPU cost, and the AI marking queue under a free-tier rate limit.
const L = require('../src/services/logic'); const { createQueue } = require('../src/services/queue');
const mkTest = () => ({ title: 'Big exam', durationMinutes: 60, totalMarks: 27, questions: [
  ...Array.from({ length: 12 }, (_, i) => ({ id: 'q' + (i + 1), type: 'mcq', text: 'Q' + i, options: ['a', 'b', 'c', 'd'], correctIndex: i % 4, maxMarks: 1 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: 'q' + (13 + i), type: 'short', text: 'S' + i, modelAnswer: 'm', criteria: [{ name: 'x', marks: 5 }], maxMarks: 5 }))] });
const test = mkTest(); const N = +process.argv[2] || 5000;
console.log(`\n== Part 1: server CPU cost for ${N} students (answer validation + MCQ marking + safe test build) ==`);
const t0 = process.hrtime.bigint(); let checksum = 0;
for (let s = 0; s < N; s++) {
  const ans = {}; test.questions.forEach((q) => { ans[q.id] = q.type === 'mcq' ? Math.floor(Math.random() * 4) : 'a typical written answer '.repeat(10); });
  L.safeTest(test, test.questions.map((q) => q.id)); L.sanitizeAnswers(test, ans); checksum += L.sum(L.autoMark(test, ans).map((r) => r.awarded));
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`total ${ms.toFixed(0)} ms, ${(ms / N).toFixed(3)} ms per student (checksum ${checksum})`);
console.log('=> app logic is not the bottleneck; the database and the AI rate limit are.');

const scale = 120; const R = 10, LAT = 3000, C = 3; // free-tier-like: 10 requests/min, 3 s per AI call, 3 at once
console.log(`\n== Part 2: AI marking queue, real limits ${R} calls/min, ${LAT / 1000}s per call, ${C} parallel; run at ${scale}x speed ==`);
(async () => {
  for (const [jobs, failPct] of [[60, 0], [120, 0.2]]) {
    let fails = 0, calls = 0; const gaveUp = [];
    const q = createQueue({ concurrency: C, rpm: R * scale, retries: 3, backoffMs: 5000 / scale,
      handler: async () => { calls++; await new Promise((r) => setTimeout(r, LAT / scale)); if (Math.random() < failPct) { fails++; throw new Error('429'); } },
      onGiveUp: async (d) => gaveUp.push(d) });
    const t = Date.now(); for (let i = 0; i < jobs; i++) q.add(i); await q.onIdle();
    const virtualMin = ((Date.now() - t) * scale) / 60000; const st = q.stats();
    console.log(`${jobs} students, ${failPct * 100}% injected failures: done ${st.done}, retried ${st.retried}, gave up ${st.failed}, peak parallel ${st.maxActive}, AI calls ${calls}, virtual time ${virtualMin.toFixed(1)} min`);
  }
  console.log('\n== Part 3: projected marking time (1 AI call per student; all students submit at once) ==');
  console.log('students | 10 calls/min | 30 calls/min (two models together)');
  for (const n of [30, 100, 500, 1000, 2000]) console.log(`${String(n).padStart(8)} | ${(n / 10).toFixed(0).padStart(7)} min | ${(n / 30).toFixed(0).padStart(7)} min`);
})();
