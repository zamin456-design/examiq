const test = require('node:test'); const assert = require('node:assert/strict');
const { createQueue } = require('../src/services/queue');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('never runs more jobs at once than the concurrency limit; finishes all', async () => {
  let cur = 0, peak = 0;
  const q = createQueue({ concurrency: 3, rpm: 0, handler: async () => { cur++; peak = Math.max(peak, cur); await sleep(5); cur--; } });
  for (let i = 0; i < 200; i++) q.add({ i }); await q.onIdle();
  assert.equal(peak, 3); assert.equal(q.stats().done, 200); assert.equal(q.stats().failed, 0);
});
test('spaces job starts to respect requests-per-minute', async () => {
  const starts = []; const q = createQueue({ concurrency: 5, rpm: 600, handler: async () => { starts.push(Date.now()); } }); // 100 ms apart
  for (let i = 0; i < 6; i++) q.add(i); await q.onIdle();
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 90, `gap ${starts[i] - starts[i - 1]}`);
});
test('retries a failing job, then succeeds', async () => {
  let n = 0; const q = createQueue({ concurrency: 1, rpm: 0, retries: 3, backoffMs: 5, handler: async () => { if (++n < 3) throw new Error('429'); } });
  q.add('x'); await q.onIdle(); assert.equal(n, 3); assert.equal(q.stats().done, 1); assert.equal(q.stats().retried, 2); assert.equal(q.stats().failed, 0);
});
test('gives up after the retry limit and hands the job to onGiveUp (never lost)', async () => {
  const gave = []; const q = createQueue({ concurrency: 1, rpm: 0, retries: 2, backoffMs: 2, handler: async () => { throw new Error('down'); }, onGiveUp: async (d) => gave.push(d) });
  q.add('job1'); await q.onIdle(); assert.deepEqual(gave, ['job1']); assert.equal(q.stats().failed, 1); assert.equal(q.stats().retried, 2);
});
test('one failing job does not block the others', async () => {
  const done = []; const q = createQueue({ concurrency: 2, rpm: 0, retries: 0, handler: async (d) => { if (d === 'bad') throw new Error('x'); done.push(d); } });
  ['a', 'bad', 'b', 'c'].forEach((d) => q.add(d)); await q.onIdle(); assert.deepEqual(done.sort(), ['a', 'b', 'c']);
});
test('duplicate keys are ignored while queued, allowed again after finishing', async () => {
  let n = 0; const q = createQueue({ concurrency: 1, rpm: 0, handler: async () => { n++; await sleep(5); } });
  assert.ok(q.add('d', 'k1')); assert.ok(!q.add('d', 'k1')); await q.onIdle(); assert.equal(n, 1); assert.ok(q.add('d', 'k1')); await q.onIdle(); assert.equal(n, 2);
});
test('onGiveUp that itself throws does not crash or hang the queue', async () => {
  const q = createQueue({ concurrency: 1, rpm: 0, retries: 0, handler: async () => { throw new Error('a'); }, onGiveUp: async () => { throw new Error('b'); } });
  q.add(1); q.add(2); await q.onIdle(); assert.equal(q.stats().failed, 2);
});
test('onIdle resolves immediately when empty', async () => { await createQueue({ handler: async () => {} }).onIdle(); });
