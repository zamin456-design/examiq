import React, { useState } from 'react';
import { api, useLoad } from '../api';
import { Err, Tag } from '../ui';
export function Admin() {
  const [approvalError, setApprovalError] = useState('');
  const [s, reloadStats, statsError] = useLoad('/admin/stats');
  const [u, reloadU, usersError] = useLoad('/admin/users');
  const [pendingTeachers, reloadPendingTeachers, pendingError] = useLoad('/admin/pending-teachers');
  const [logs] = useLoad('/admin/ai-logs'); const [au] = useLoad('/admin/audit');
  const set = async (id, status) => {
    setApprovalError('');
    try {
      await api('/admin/users/' + id, { method: 'PATCH', body: { status } });
      reloadU(); reloadPendingTeachers(); reloadStats();
    } catch (e) { setApprovalError(e.message); }
  };
  return (<><div className="row"><div><h1>AI usage and health</h1><p className="sub">Watch generation, marking and users across the platform.</p></div><Tag c="ok">Admin</Tag></div>
    <div className="c"><h2>Teacher approvals {pendingTeachers?.length > 0 && <Tag c="wa">{pendingTeachers.length} waiting</Tag>}</h2>
      <Err e={pendingError || approvalError} />
      {!pendingTeachers ? !pendingError && <p className="k">Loading pending teachers...</p> : pendingTeachers.length === 0 ? <p className="k">No teachers waiting for approval.</p> :
        <table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th /></tr></thead><tbody>{pendingTeachers.map((x) => <tr key={x._id}><td>{x.name}</td><td>{x.email}</td><td><Tag c="wa">Pending approval</Tag></td>
          <td><button onClick={() => set(x._id, 'active')}>Approve</button></td></tr>)}</tbody></table>}</div>
    <Err e={statsError} />
    {s && <div className="g g4"><div className="c"><span className="k">Users</span><div className="n">{s.users}</div></div><div className="c"><span className="k">AI-generated tests</span><div className="n">{s.testsGenerated}</div></div>
      <div className="c"><span className="k">AI call success</span><div className="n">{s.aiSuccess ?? '-'}{s.aiSuccess != null && '%'}</div></div><div className="c"><span className="k">Marks overridden</span><div className="n">{s.overrides}</div></div></div>}
    {s?.byModel.length > 0 && <div className="c"><h2>Models</h2>{s.byModel.map((m) => <div key={m._id} className="row"><span>{m._id === 'gemini' ? 'Gemini' : 'Second model'}</span><span className="k">{m.calls} calls · {m.ok} ok · {Math.round(m.ms)} ms average</span></div>)}</div>}
    <div className="c"><h2>Users</h2><Err e={usersError} />{!u && !usersError ? <p className="k">Loading users...</p> : <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
      <tbody>{(u || []).map((x) => <tr key={x._id}><td>{x.name}</td><td>{x.email}</td><td>{x.role}</td><td><Tag c={x.status === 'active' ? 'ok' : x.status === 'pending' ? 'wa' : 'bad'}>{x.status}</Tag></td>
        <td>{x.role !== 'admin' && (x.status === 'active' ? <button className="bg" onClick={() => set(x._id, 'disabled')}>Disable</button> : <button onClick={() => set(x._id, 'active')}>Approve</button>)}</td></tr>)}</tbody></table>}</div>
    <div className="g g2"><div className="c"><h2>Recent AI calls</h2>{(logs || []).slice(0, 10).map((l) => <div key={l._id} className="row"><span>{l.task} · {l.model}</span><Tag c={l.ok ? 'ok' : 'bad'}>{l.ok ? l.ms + ' ms' : 'failed'}</Tag></div>)}</div>
      <div className="c"><h2>Audit log</h2>{(au || []).slice(0, 10).map((a) => <div key={a._id} className="row"><span>{a.action}</span><span className="k">{a.actor?.name}</span></div>)}</div></div></>);
}
