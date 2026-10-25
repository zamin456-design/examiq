import React, { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import { api, useLoad } from './api';
const NAV = {
  student: [['/student', 'Dashboard'], ['/student/courses', 'My courses'], ['/student/results', 'Results']],
  teacher: [['/teacher', 'Dashboard'], ['/teacher/command', 'AI Command Center'], ['/teacher/courses', 'Courses'], ['/teacher/students', 'Students'], ['/teacher/review', 'Review queue']],
  admin: [['/admin', 'Overview']],
};
export const Tag = ({ c = '', children }) => <span className={'tag ' + c}>{children}</span>;
export const Err = ({ e }) => (e ? <p className="err" role="alert">{e}</p> : null);
function Bell() {
  const [open, setOpen] = useState(false); const [n, reload] = useLoad('/notifications');
  const unread = (n || []).filter((x) => !x.readAt).length;
  const toggle = async () => { setOpen(!open); if (!open && unread) { await api('/notifications/read', { method: 'POST' }); setTimeout(reload, 1500); } };
  return (<div style={{ alignSelf: 'flex-end' }}><button className="bg" onClick={toggle}>Notifications{unread ? ` (${unread})` : ''}</button>
    {open && <div className="c" style={{ position: 'absolute', right: 36, zIndex: 5, width: 320, marginTop: 8 }}>{(n || []).length ? n.map((x) => <div key={x._id}>{x.message}</div>) : <span className="k">Nothing yet</span>}</div>}</div>);
}
export function Guard({ role }) {
  const { user, loading, logout } = useAuth();
  if (loading) return <p style={{ padding: 40 }}>Loading...</p>;
  if (!user || user.role !== role) return <Navigate to="/login" replace />;
  return (<div className="app"><aside className="sb"><div className="lg">Exam<i>IQ</i></div><div className="k pad">{user.name} · {role}</div>
    {NAV[role].map(([to, l]) => <NavLink key={to} to={to} end>{l}</NavLink>)}<div style={{ flex: 1 }} /><button className="lnk" onClick={logout}>Log out</button></aside>
    <main className="mn"><Bell /><Outlet /></main></div>);
}
