import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Err } from '../ui';
export function Landing() {
  const steps = [['01', 'Command', 'Type what you need in plain language.'], ['02', 'Blueprint', 'AI plans it first. You edit the plan.'], ['03', 'Artifact', 'Test, assignment or notes are generated.'], ['04', 'Review', 'Edit, then publish. Students see only published work.']];
  return (<div className="pub col" style={{ gap: 56 }}>
    <nav className="row"><div className="lg" style={{ margin: 0, padding: 0 }}>Exam<i>IQ</i></div><div className="row"><Link className="bt bg" to="/login">Log in</Link><Link className="bt" to="/register">Start free</Link></div></nav>
    <section className="col" style={{ gap: 20, maxWidth: 760 }}><span className="tag ai" style={{ alignSelf: 'flex-start' }}>AI examination platform</span>
      <h1 style={{ fontSize: 52, lineHeight: 1.05 }}>Tell it what to teach. ExamIQ builds the test, marks it, and shows its working.</h1>
      <p className="sub" style={{ fontSize: 18 }}>Teachers give one command. Students learn, submit and sit exams. Every AI result can be reviewed and changed by a teacher.</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}><Link className="bt" to="/register">Create an account</Link></div></section>
    <section><h2 style={{ fontSize: 28, marginBottom: 16 }}>One loop for everything the AI does</h2>
      <div className="g g4">{steps.map(([n, t, d]) => <div className="c" key={n}><div className="n" style={{ color: '#C8F560' }}>{n}</div><h3>{t}</h3><p className="sub">{d}</p></div>)}</div></section></div>);
}
export function Login() {
  const [f, setF] = useState({ email: '', password: '' }); const [e, setE] = useState(''); const { login } = useAuth(); const nav = useNavigate();
  const go = async (ev) => { ev.preventDefault(); try { const d = await api('/auth/login', { method: 'POST', body: f }); login(d); nav('/' + d.user.role); } catch (x) { setE(x.message); } };
  return (<form className="c narrow" onSubmit={go}><h1>Log in</h1>
    <label>Email<input type="email" required value={f.email} onChange={(v) => setF({ ...f, email: v.target.value })} /></label>
    <label>Password<input type="password" required value={f.password} onChange={(v) => setF({ ...f, password: v.target.value })} /></label>
    <Err e={e} /><button>Log in</button><p className="k">New here? <Link to="/register">Create an account</Link></p></form>);
}
export function Register() {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'student' }); const [e, setE] = useState(''); const [m, setM] = useState(''); const { login } = useAuth(); const nav = useNavigate();
  const go = async (ev) => { ev.preventDefault(); setE(''); try { const d = await api('/auth/register', { method: 'POST', body: f }); if (d.pending) setM(d.message); else { login(d); nav('/' + d.user.role); } } catch (x) { setE(x.message); } };
  const set = (k) => (v) => setF({ ...f, [k]: v.target.value });
  return (<form className="c narrow" onSubmit={go}><h1>Create account</h1>
    <label>I am a<select value={f.role} onChange={set('role')}><option value="student">Student</option><option value="teacher">Teacher (needs admin approval)</option></select></label>
    <label>Full name<input required value={f.name} onChange={set('name')} /></label>
    <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
    <label>Password (8+ characters)<input type="password" minLength={8} required value={f.password} onChange={set('password')} /></label>
    <Err e={e} />{m && <p className="msg">{m}</p>}<button>Sign up</button><p className="k">Already registered? <Link to="/login">Log in</Link></p></form>);
}
