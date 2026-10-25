import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useLoad } from '../api';
import { Tag, Err } from '../ui';
export function TDash() {
  const [cs] = useLoad('/courses'); const [q] = useLoad('/marking/queue'); const [st] = useLoad('/teacher/students');
  const pending = q ? q.attempts.length + q.subs.length : '-';
  return (<><div><h1>Dashboard</h1><p className="sub">Your classes at a glance.</p></div>
    <div className="g g3"><div className="c"><span className="k">Courses</span><div className="n">{cs ? cs.length : '-'}</div></div><div className="c"><span className="k">Students</span><div className="n">{st ? st.length : '-'}</div></div>
      <div className="c"><span className="k">Waiting for your review</span><div className="n">{pending}</div></div></div>
    <div className="c row"><div><h2>Need a test, assignment or notes?</h2><p className="sub">Tell the AI Command Center what you need.</p></div><Link className="bt" to="/teacher/command">Open AI Command Center</Link></div></>);
}
const STEPS = ['Command', 'Blueprint', 'Artifact', 'Review'];
export function Command() {
  const [cs] = useLoad('/courses'); const [hist, reloadH] = useLoad('/ai/commands');
  const [courseId, setCourseId] = useState(''); const [text, setText] = useState(''); const [cmd, setCmd] = useState(null); const [bp, setBp] = useState(null);
  const [art, setArt] = useState(null); const [busy, setBusy] = useState(''); const [e, setE] = useState(''); const [pub, setPub] = useState(false);
  useEffect(() => { if (cs && cs.length && !courseId) setCourseId(cs[0]._id); }, [cs]);
  const run = async (label, fn) => { setBusy(label); setE(''); try { await fn(); } catch (x) { setE(x.message); } setBusy(''); };
  const send = () => run('Planning...', async () => { const c = await api('/ai/command', { method: 'POST', body: { text, courseId } }); setCmd(c); setBp(c.blueprint); setArt(null); setPub(false); reloadH(); });
  const approve = () => run('Generating, this can take up to a minute...', async () => {
    await api(`/ai/commands/${cmd._id}/blueprint`, { method: 'PUT', body: { blueprint: bp } });
    setArt(await api(`/ai/commands/${cmd._id}/approve`, { method: 'POST' })); });
  const publish = () => run('Publishing...', async () => { await api(`/ai/artifacts/${art.kind}/${art.artifact._id}/publish`, { method: 'POST' }); setPub(true); });
  const stage = pub ? 4 : art ? 3 : bp ? 2 : 1;
  const setSec = (k, f, v) => setBp({ ...bp, sections: bp.sections.map((s, j) => (j === k ? { ...s, [f]: v } : s)) });
  const A = art?.artifact;
  if (cs && !cs.length) return <div className="c"><h2>Create a course first</h2><Link className="bt" to="/teacher/courses">Go to courses</Link></div>;
  return (<><div><h1>AI Command Center</h1><p className="sub">Say what you need. Check the plan. Then generate.</p></div>
    <div className="c row" style={{ flexDirection: 'row' }}>{STEPS.map((s, k) => <Tag key={s} c={k + 1 < stage ? 'ok' : k + 1 === stage ? 'ai' : ''}>{k + 1} {s}</Tag>)}</div><Err e={e} />{busy && <p className="msg">{busy}</p>}
    <div className="g g2"><div className="c"><h2>Your command</h2>
      <label>Course<select value={courseId} onChange={(v) => setCourseId(v.target.value)}>{(cs || []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}</select></label>
      <label>What should the AI create?<textarea rows={5} value={text} onChange={(v) => setText(v.target.value)} placeholder="Create a 20-mark test on Chapter 3 Photosynthesis. 10 MCQs, 2 short questions, medium, 30 minutes." /></label>
      <button disabled={!!busy || text.length < 5} onClick={send}>Make a blueprint</button>
      {hist?.length > 0 && <><span className="k">Recent</span>{hist.slice(0, 4).map((h) => <span key={h._id} className="k">· {h.text.slice(0, 70)}</span>)}</>}</div>
      <div className="c"><div className="row"><h2>Blueprint</h2><Tag c="ai">Editable</Tag></div>{!bp ? <span className="k">Your plan appears here.</span> : <>
        <div className="g g2"><label>Type<input readOnly value={bp.type} /></label><label>Title<input value={bp.title} onChange={(v) => setBp({ ...bp, title: v.target.value })} /></label>
          <label>Topic<input value={bp.topic} onChange={(v) => setBp({ ...bp, topic: v.target.value })} /></label>
          <label>Difficulty<select value={bp.difficulty} onChange={(v) => setBp({ ...bp, difficulty: v.target.value })}><option>easy</option><option>medium</option><option>hard</option></select></label>
          {bp.type === 'test' && <label>Duration (min)<input type="number" min="5" value={bp.durationMinutes} onChange={(v) => setBp({ ...bp, durationMinutes: +v.target.value })} /></label>}
          {bp.type !== 'test' && <label>Total marks<input type="number" min="1" value={bp.totalMarks} onChange={(v) => setBp({ ...bp, totalMarks: +v.target.value })} /></label>}</div>
        {bp.sections?.map((s, k) => <div className="c in2 g g3" key={k}><label>Type<select value={s.questionType} onChange={(v) => setSec(k, 'questionType', v.target.value)}><option value="mcq">MCQ</option><option value="short">Short answer</option></select></label>
          <label>Count<input type="number" min="1" max="30" value={s.count} onChange={(v) => setSec(k, 'count', +v.target.value)} /></label><label>Marks each<input type="number" min="0.5" step="0.5" value={s.marksEach} onChange={(v) => setSec(k, 'marksEach', +v.target.value)} /></label></div>)}
        <button disabled={!!busy} onClick={approve}>Approve and generate</button></>}</div></div>
    {A && <div className="c"><div className="row"><h2>Draft: {A.title}</h2>{pub ? <Tag c="ok">Published to students</Tag> : <Tag c="wa">Draft, students cannot see it</Tag>}</div>
      {art.kind === 'tests' && A.questions.map((q) => <div className="c in2" key={q.id}><b>{q.id.slice(1)}. {q.text}</b> <span className="k">({q.maxMarks} mark(s))</span>
        {q.type === 'mcq' ? q.options.map((o, k) => <span key={k} className={k === q.correctIndex ? 'msg' : 'k'}>{k === q.correctIndex ? 'Correct: ' : ''}{o}</span>) : <><span className="k">Model answer: {q.modelAnswer}</span><span className="k">Marking contract: {q.criteria.map((c) => `${c.name} (${c.marks})`).join(', ')}</span></>}</div>)}
      {art.kind === 'assignments' && <><pre>{A.instructions}</pre><span className="k">Marking contract: {A.contract.criteria.map((c) => `${c.name} (${c.marks})`).join(', ')}</span></>}
      {art.kind === 'materials' && <pre>{A.content}</pre>}
      {!pub && <div className="row"><span className="k">Read it through, then publish. You can regenerate by sending a new command.</span><button disabled={!!busy} onClick={publish}>Publish</button></div>}</div>}</>);
}
function CourseCard({ c, reload }) {
  const [email, setEmail] = useState(''); const [n, setN] = useState({ title: '', content: '' }); const [m, setM] = useState(''); const [an, setAn] = useState(null);
  const act = async (fn) => { setM(''); try { await fn(); reload(); } catch (x) { setM(x.message); } };
  const csv = async () => { const r = await fetch(`/api/v1/export/results/${c._id}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = c.title + '-results.csv'; a.click(); };
  return (<div className="c"><div className="row"><h2>{c.title}</h2><Tag c="ai">Join code: {c.joinCode}</Tag></div><span className="k">{c.studentCount} student(s)</span>
    <form className="row" onSubmit={(ev) => { ev.preventDefault(); act(async () => { await api(`/courses/${c._id}/enroll`, { method: 'POST', body: { email } }); setEmail(''); setM('Student added'); }); }}>
      <input style={{ flex: 1 }} type="email" required aria-label="Student email" placeholder="Add a student by email" value={email} onChange={(v) => setEmail(v.target.value)} /><button className="bg">Add</button></form>
    <form className="col" style={{ gap: 8 }} onSubmit={(ev) => { ev.preventDefault(); act(async () => { await api(`/courses/${c._id}/materials`, { method: 'POST', body: n }); setN({ title: '', content: '' }); setM('Note added'); }); }}>
      <input required aria-label="Note title" placeholder="Note title" value={n.title} onChange={(v) => setN({ ...n, title: v.target.value })} /><textarea required rows={2} aria-label="Note text" placeholder="Note text" value={n.content} onChange={(v) => setN({ ...n, content: v.target.value })} /><button className="bg">Add note</button></form>
    <div className="row"><button className="bg" onClick={async () => setAn(await api('/analytics/course/' + c._id))}>Show results</button><button className="bg" onClick={csv}>Download CSV</button></div><Err e={m} />
    {an?.tests.map((t) => <div key={t.title} className="c in2"><b>{t.title}</b><span className="k">{t.attempts} attempt(s) · average {t.average ?? '-'}%</span>{t.hardest.map((h) => <span key={h.q} className="k">Hardest: {h.q} ({h.pct}%)</span>)}</div>)}</div>);
}
export function TCourses() {
  const [cs, reload] = useLoad('/courses'); const [f, setF] = useState({ title: '', description: '' }); const [e, setE] = useState('');
  const create = async (ev) => { ev.preventDefault(); setE(''); try { await api('/courses', { method: 'POST', body: f }); setF({ title: '', description: '' }); reload(); } catch (x) { setE(x.message); } };
  return (<><h1>Courses</h1><form className="c" onSubmit={create}><h2>New course</h2><div className="g g2"><label>Title<input required value={f.title} onChange={(v) => setF({ ...f, title: v.target.value })} /></label>
    <label>Description<input value={f.description} onChange={(v) => setF({ ...f, description: v.target.value })} /></label></div><Err e={e} /><button style={{ alignSelf: 'flex-start' }}>Create course</button></form>
    <div className="g g2">{(cs || []).map((c) => <CourseCard key={c._id} c={c} reload={reload} />)}</div></>);
}
export function TStudents() {
  const [s] = useLoad('/teacher/students');
  return (<><h1>Students</h1><div className="c">{!s ? 'Loading...' : !s.length ? <span className="k">No students yet. Share a course join code.</span> :
    <table><thead><tr><th>Name</th><th>Email</th><th>Courses</th><th>Average</th></tr></thead><tbody>{s.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td>{x.courses.join(', ')}</td><td>{x.average == null ? '-' : x.average + '%'}</td></tr>)}</tbody></table>}</div></>);
}
function Item({ it, attemptId, reload }) {
  const [v, setV] = useState(it.awarded); const [fb, setFb] = useState(it.feedback || ''); const [m, setM] = useState('');
  const save = async () => { try { await api('/marking/attempts/' + attemptId, { method: 'PATCH', body: { qid: it.qid, awarded: v, feedback: fb } }); setM('Saved'); reload(); } catch (x) { setM(x.message); } };
  return (<div className="c in2"><b>{it.question}</b><span className="k">Student answer:</span><pre>{it.answer || '(blank)'}</pre>
    <Tag c={it.confidence >= 0.75 ? 'ok' : 'wa'}>{it.source === 'auto' ? 'Marked by code' : `AI confidence ${Math.round(it.confidence * 100)}%`}</Tag>
    <div className="g g2"><label>Marks (max {it.max})<input type="number" min="0" max={it.max} step="0.5" value={v} onChange={(x) => setV(x.target.value)} /></label><label>Feedback<input value={fb} onChange={(x) => setFb(x.target.value)} /></label></div>
    <div className="row"><span className="k">{m}</span><button className="bg" onClick={save}>Save mark</button></div></div>);
}
function SubItem({ s, reload }) {
  const [v, setV] = useState(s.ai?.awarded ?? 0); const [c, setC] = useState(s.ai?.feedback || ''); const [m, setM] = useState('');
  const go = async (approve) => { try { await api('/marking/submissions/' + s._id, { method: 'PATCH', body: { marks: v, comment: c } }); if (approve) await api(`/marking/submissions/${s._id}/approve`, { method: 'POST' }); reload(); } catch (x) { setM(x.message); } };
  return (<div className="c"><div className="row"><h3>{s.assignment} · {s.student.name}</h3><Tag c="wa">AI confidence {Math.round((s.ai?.confidence || 0) * 100)}%</Tag></div><pre>{s.text}</pre>{s.fileUrl && <a href={s.fileUrl} target="_blank" rel="noreferrer">Open attached file</a>}
    <div className="g g2"><label>Marks (max {s.max})<input type="number" min="0" max={s.max} step="0.5" value={v} onChange={(x) => setV(x.target.value)} /></label><label>Comment<input value={c} onChange={(x) => setC(x.target.value)} /></label></div><Err e={m} /><button onClick={() => go(true)}>Save and approve</button></div>);
}
export function Review() {
  const [q, reload] = useLoad('/marking/queue'); const [e, setE] = useState('');
  const approve = async (id) => { try { await api(`/marking/attempts/${id}/approve`, { method: 'POST' }); reload(); } catch (x) { setE(x.message); } };
  if (!q) return <p>Loading...</p>;
  return (<><div><h1>Review queue</h1><p className="sub">AI marks it, you decide. Items appear here when the AI was not confident.</p></div><Err e={e} />
    {q.attempts.map((a) => <div key={a._id} className="c"><div className="row"><h2>{a.test} · {a.student.name}</h2>{a.flags > 0 && <Tag c="bad">{a.flags} tab switch(es)</Tag>}</div>
      {a.items.filter((i) => i.type === 'short').map((i) => <Item key={i.qid} it={i} attemptId={a._id} reload={() => {}} />)}<button onClick={() => approve(a._id)}>Approve and release marks</button></div>)}
    {q.subs.map((s) => <SubItem key={s._id} s={s} reload={reload} />)}{!q.attempts.length && !q.subs.length && <div className="c"><span className="k">Nothing to review. Nice.</span></div>}</>);
}
