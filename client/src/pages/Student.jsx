import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useLoad } from '../api';
import { Tag, Err } from '../ui';
const fmt = (d) => (d ? new Date(d).toLocaleString() : 'No deadline');
export function SDash() {
  const [u] = useLoad('/student/upcoming');
  if (!u) return <p>Loading...</p>;
  return (<><div><h1>Welcome back</h1><p className="sub">Here is what needs your attention.</p></div>
    <div className="g g4"><div className="c"><span className="k">Courses</span><div className="n">{u.courses}</div></div><div className="c"><span className="k">Assignments due</span><div className="n">{u.assignments.length}</div></div>
      <div className="c"><span className="k">Tests to take</span><div className="n">{u.tests.length}</div></div><div className="c"><span className="k">Results ready</span><div className="n">{u.results}</div></div></div>
    <div className="g g2"><div className="c"><h2>Upcoming assignments</h2>{u.assignments.length ? u.assignments.map((a) => <Link key={a._id} className="c in2" to={`/student/courses/${a.course}`}>{a.title}<span className="k">Due {fmt(a.dueAt)}</span></Link>) : <span className="k">All caught up</span>}</div>
      <div className="c"><h2>Tests</h2>{u.tests.length ? u.tests.map((t) => <Link key={t._id} className="c in2" to={`/student/courses/${t.course}`}>{t.title}<span className="k">{t.durationMinutes} min</span></Link>) : <span className="k">No tests waiting</span>}</div></div></>);
}
export function SCourses() {
  const [cs, reload] = useLoad('/courses'); const [code, setCode] = useState(''); const [e, setE] = useState(''); const [m, setM] = useState('');
  const join = async (ev) => { ev.preventDefault(); setE(''); setM(''); try { const d = await api('/courses/join', { method: 'POST', body: { joinCode: code } }); setM('Joined ' + d.course); setCode(''); reload(); } catch (x) { setE(x.message); } };
  return (<><h1>My courses</h1>
    <form className="c row" onSubmit={join}><label style={{ flex: 1 }}>Join with a code from your teacher<input value={code} onChange={(v) => setCode(v.target.value)} placeholder="ABC123" /></label><button>Join course</button></form>
    <Err e={e} />{m && <p className="msg">{m}</p>}
    <div className="g g3">{(cs || []).map((c) => <Link key={c._id} to={`/student/courses/${c._id}`} className="c" style={{ textDecoration: 'none', color: 'inherit' }}><h2>{c.title}</h2><span className="k">Teacher: {c.teacher?.name}</span><p className="sub">{c.description}</p></Link>)}</div>
    {cs && !cs.length && <p className="sub">You have not joined a course yet.</p>}</>);
}
function Submit({ a, onDone }) {
  const [t, setT] = useState(''); const [file, setFile] = useState(null); const [e, setE] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (ev) => { ev.preventDefault(); setBusy(true); setE(''); const fd = new FormData(); fd.append('text', t); if (file) fd.append('file', file);
    try { await api(`/assignments/${a._id}/submit`, { method: 'POST', form: fd }); setT(''); onDone(); } catch (x) { setE(x.message); } setBusy(false); };
  return (<form className="col" style={{ gap: 8 }} onSubmit={go}><label>Your answer<textarea rows={4} value={t} onChange={(v) => setT(v.target.value)} /></label>
    <label>Or attach a file (pdf, txt, png, jpg, 5 MB max)<input type="file" onChange={(v) => setFile(v.target.files[0])} /></label><Err e={e} /><button disabled={busy}>{busy ? 'Sending...' : 'Submit'}</button></form>);
}
export function SCourse() {
  const { id } = useParams(); const [d, reload] = useLoad('/courses/' + id);
  if (!d) return <p>Loading...</p>;
  const sub = (a) => d.subs.find((s) => s.assignment === a._id); const att = (t) => d.attempts.find((x) => x.test === t._id);
  return (<><div><h1>{d.course.title}</h1><p className="sub">{d.course.description} · Teacher: {d.course.teacher?.name}</p></div>
    <div className="c"><h2>Materials</h2>{d.materials.length ? d.materials.map((m) => <div className="c in2" key={m._id}><h3>{m.title}</h3><pre>{m.content}</pre></div>) : <span className="k">Nothing yet</span>}</div>
    <div className="c"><h2>Assignments</h2>{d.assignments.map((a) => { const s = sub(a); return (<div className="c in2" key={a._id}><div className="row"><h3>{a.title}</h3><span className="k">Due {fmt(a.dueAt)} · {a.maxMarks} marks</span></div><pre>{a.instructions}</pre>
      {s?.status === 'final' ? <p className="msg">Marked: {s.finalMarks}/{a.maxMarks}. {s.teacherComment || s.feedback}</p> : s ? <Tag c="wa">Submitted, being marked</Tag> : null}
      {s?.status !== 'final' && <Submit a={a} onDone={reload} />}</div>); })}{!d.assignments.length && <span className="k">No assignments</span>}</div>
    <div className="c"><h2>Tests</h2>{d.tests.map((t) => { const a = att(t); return (<div className="c in2 row" key={t._id}><div>{t.title}<div className="k">{t.durationMinutes} min · {t.totalMarks} marks</div></div>
      {!a ? <Link className="bt" to={`/student/test/${t._id}`}>Start test</Link> : a.status === 'in_progress' ? <Link className="bt" to={`/student/test/${t._id}`}>Resume</Link> : a.status === 'final' ? <Tag c="ok">{a.finalScore}/{t.totalMarks}</Tag> : <Tag c="wa">Being marked</Tag>}</div>); })}{!d.tests.length && <span className="k">No tests</span>}</div></>);
}
export function TakeTest() {
  const { id } = useParams(); const nav = useNavigate(); const [s, setS] = useState(null); const [e, setE] = useState(''); const [i, setI] = useState(0);
  const [ans, setAns] = useState({}); const [left, setLeft] = useState(null); const [saved, setSaved] = useState(''); const done = useRef(false);
  const dirty = useRef({}); const sref = useRef(null); const ansRef = useRef({});
  useEffect(() => { api(`/tests/${id}/start`, { method: 'POST' }).then((d) => { d.deadline = Date.now() + d.remainingMs; sref.current = d; ansRef.current = d.attempt.answers || {}; setS(d); setAns(ansRef.current); }).catch((x) => setE(x.message)); }, [id]);
  // Answers are sent in small batches (every 8 seconds, on question change, when the tab is hidden) so a big class does not flood the server.
  const flush = async () => { const d = dirty.current; if (!sref.current || done.current || !Object.keys(d).length) return; dirty.current = {};
    try { await api(`/attempts/${sref.current.attempt._id}/answers`, { method: 'PATCH', body: { answers: d } }); setSaved('Saved'); } catch (x) { dirty.current = { ...d, ...dirty.current }; setSaved('Not saved yet, retrying...'); } };
  const change = (qid, v) => { ansRef.current = { ...ansRef.current, [qid]: v }; dirty.current[qid] = v; setAns(ansRef.current); setSaved('Saving...'); };
  const finish = async () => { if (done.current || !sref.current) return; done.current = true; const url = `/attempts/${sref.current.attempt._id}/submit`;
    try { await api(url, { method: 'POST', body: { answers: ansRef.current } }); } catch (x) { try { await api(url, { method: 'POST' }); } catch (y) { if (!/already/i.test(y.message)) { done.current = false; setSaved(y.message + ' - press Submit again'); return; } } }
    nav('/student/results'); };
  useEffect(() => { if (!s) return; const t = setInterval(() => { const l = Math.max(0, Math.floor((s.deadline - Date.now()) / 1000)); setLeft(l); if (l === 0) finish(); }, 500); const f = setInterval(flush, 8000); return () => { clearInterval(t); clearInterval(f); }; }, [s]);
  useEffect(() => { const h = () => { if (document.hidden && sref.current) { flush(); api(`/attempts/${sref.current.attempt._id}/flag`, { method: 'POST', body: { type: 'tab_switch' } }).catch(() => {}); } }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); }, []);
  if (e) return <div className="c narrow"><Err e={e} /><Link to="/student/courses">Back to courses</Link></div>;
  if (!s) return <p style={{ padding: 40 }}>Loading...</p>;
  const q = s.test.questions[i]; const go = (k) => { flush(); setI(k); };
  const mm = left === null ? '--:--' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return (<div className="mn" style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
    <div className="row"><h2>{s.test.title}</h2><div className="row"><Tag c="ok">{saved || 'Answers save automatically'}</Tag><span className="n" style={{ fontSize: 24 }}>{mm}</span></div></div>
    <div className="g" style={{ gridTemplateColumns: '1fr 240px' }}>
      <div className="c"><span className="k">QUESTION {i + 1} OF {s.test.questions.length} · {q.maxMarks} MARK(S)</span><div className="bar"><i style={{ width: ((i + 1) / s.test.questions.length) * 100 + '%' }} /></div>
        <h2 style={{ fontSize: 22 }}>{q.text}</h2>
        {q.type === 'mcq' ? q.options.map((o, k) => <label key={k} className={'c in2 opt'} style={ans[q.id] === k ? { borderColor: '#C8F560' } : {}}><input type="radio" name={q.id} checked={ans[q.id] === k} onChange={() => change(q.id, k)} />{o}</label>)
          : <textarea rows={7} maxLength={8000} aria-label="Your answer" value={ans[q.id] || ''} onChange={(v) => change(q.id, v.target.value)} onBlur={flush} />}
        <div className="row"><button className="bg" disabled={i === 0} onClick={() => go(i - 1)}>Previous</button><button disabled={i === s.test.questions.length - 1} onClick={() => go(i + 1)}>Next question</button></div></div>
      <aside className="c"><h3>Questions</h3><div className="g" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>{s.test.questions.map((x, k) => <button key={x.id} className={k === i ? '' : 'bg'} style={{ padding: 0 }} onClick={() => go(k)}>{k + 1}</button>)}</div>
        <p className="k">Switching tabs is recorded and shown to your teacher.</p><button onClick={() => window.confirm('Submit your test now?') && finish()}>Submit test</button></aside></div></div>);
}
export function SResults() {
  const [d] = useLoad('/results/me'); const [open, setOpen] = useState({});
  const view = async (id) => setOpen({ ...open, [id]: await api('/attempts/' + id) });
  if (!d) return <p>Loading...</p>;
  return (<><h1>Results</h1><div className="c"><h2>Tests</h2>{d.attempts.map((a) => <div key={a._id} className="c in2"><div className="row"><span>{a.title}</span>
    {a.status === 'final' ? <><Tag c="ok">{a.finalScore}/{a.total}</Tag><button className="bg" onClick={() => view(a._id)}>See feedback</button></> : <Tag c="wa">{a.status === 'in_progress' ? 'In progress' : 'Being marked'}</Tag>}</div>
    {open[a._id]?.results?.map((r) => <div key={r.qid} className="k" style={{ borderTop: '1px solid #232938', paddingTop: 8 }}><b style={{ color: '#E8EAF0' }}>{r.question}</b><br />{r.awarded}/{r.max} · {r.feedback}</div>)}</div>)}{!d.attempts.length && <span className="k">No tests yet</span>}</div>
    <div className="c"><h2>Assignments</h2>{d.subs.map((s) => <div key={s._id} className="c in2 row"><span>{s.title}</span>{s.status === 'final' ? <span>{s.finalScore}/{s.total}. <span className="k">{s.comment || s.feedback}</span></span> : <Tag c="wa">Being marked</Tag>}</div>)}{!d.subs.length && <span className="k">No submissions yet</span>}</div></>);
}
