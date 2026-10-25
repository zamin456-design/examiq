// Small job queue: limits how many AI jobs run at once, spaces them to respect the provider's requests-per-minute,
// retries with growing delays, and hands failed jobs to onGiveUp instead of losing them.
function createQueue({ concurrency = 3, rpm = 10, retries = 3, backoffMs = 5000, handler, onGiveUp = async () => {} }) {
  const waiting = []; const keys = new Set(); const idle = [];
  let active = 0, lastStart = 0, timer = null, retrying = 0;
  const stats = { done: 0, failed: 0, retried: 0, maxActive: 0 };
  const gap = () => (rpm > 0 ? 60000 / rpm : 0);
  const size = () => waiting.length + active + retrying;
  const finish = (job) => { if (job.key) keys.delete(job.key); };
  function pump() {
    while (active < concurrency && waiting.length) {
      const wait = lastStart + gap() - Date.now();
      if (wait > 0) { if (!timer) timer = setTimeout(() => { timer = null; pump(); }, wait); return; }
      run(waiting.shift());
    }
  }
  function run(job) {
    active++; stats.maxActive = Math.max(stats.maxActive, active); lastStart = Date.now();
    Promise.resolve().then(() => handler(job.data)).then(() => { stats.done++; finish(job); }, async (e) => {
      if (job.tries < retries) { job.tries++; stats.retried++; retrying++; setTimeout(() => { retrying--; waiting.push(job); pump(); }, backoffMs * 2 ** (job.tries - 1)); }
      else { stats.failed++; try { await onGiveUp(job.data, e); } catch {} finish(job); }
    }).finally(() => { active--; pump(); if (size() === 0) idle.splice(0).forEach((f) => f()); });
  }
  function add(data, key) {
    if (key) { if (keys.has(key)) return false; keys.add(key); }
    waiting.push({ data, key, tries: 0 }); pump(); return true;
  }
  return { add, stats: () => ({ ...stats, waiting: waiting.length, active, retrying }), onIdle: () => new Promise((res) => (size() === 0 ? res() : idle.push(res))) };
}
module.exports = { createQueue };
