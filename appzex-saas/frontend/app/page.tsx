
'use client';

import { useEffect, useState } from 'react';

type User = {
  id: number;
  name: string;
  role: string;
  agencyId: number | null;
  clientId: number | null;
};

type Project = {
  id: number;
  name: string;
  description: string;
  status: string;
  priority: string;
  progress: number;
  client?: { company: string };
  tasks: any[];
  feedback: any[];
  meetings: any[];
};

const API =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function Home() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('owner@bright.test');
  const [password, setPassword] = useState('Agency123!');
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [tab, setTab] = useState('Overview');
  const [modal, setModal] = useState('');
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const call = async (
    path: string,
    method = 'GET',
    body?: any
  ) => {
    const r = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const j = await r.json();

    if (!r.ok) {
      throw Error(j.error || 'Request failed');
    }

    return j;
  };

  const load = async (t = tab) => {
    if (!user) return;

    try {
      if (user.role === 'SUPER_ADMIN') {
        const [overview, list] = await Promise.all([
          call('/admin/overview'),
          call('/admin/agencies'),
        ]);

        setData(overview);
        setAgencies(list);
      } else {
        const [d, p, f, c] = await Promise.all([
          call('/dashboard'),
          call('/projects'),
          call('/feedback'),
          call('/clients').catch(() => []),
        ]);

        setData({
          ...d,
          projects: p,
          feedbackList: f,
        });

        setClients(c);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (token && user) {
      load();
    }
  }, [token, user]);

  const login = async (e: any) => {
    e.preventDefault();
    setError('');

    try {
      const x = await call('/auth/login', 'POST', {
        email,
        password,
      });

      setToken(x.token);
      setUser(x.user);
      setTab('Overview');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setData(null);
    setTab('Overview');
  };

  const submit = async () => {
    setBusy(true);
    setError('');

    try {
      if (modal === 'client') {
        await call('/clients', 'POST', form);
      }

      if (modal === 'project') {
        await call('/projects', 'POST', form);
      }

      if (modal === 'agency') {
        await call('/admin/agencies', 'POST', form);
      }

      setModal('');
      setForm({});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: string, v: any) => {
    setForm((f: any) => ({
      ...f,
      [k]: v,
    }));
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await call(`/admin/agencies/${id}/status`, 'PATCH', {
        status,
      });

      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const ai = async (p: Project) => {
    try {
      const r = await call(
        `/projects/${p.id}/ai-update`,
        'POST',
        {}
      );

      setNotice(r.draft);
      setModal('ai');
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!user) {
    return (
      <div className="login">
        <form className="loginbox" onSubmit={login}>
          <div
            className="brand"
            style={{ color: '#182230', padding: 0 }}
          >
            Agency<span>Flow.</span>
          </div>

          <p
            className="muted"
            style={{ margin: '8px 0 28px' }}
          >
            A workspace for teams that deliver great work.
          </p>

          <div className="eyebrow">Welcome back</div>

          <h1
            className="heading"
            style={{ fontSize: 23, marginBottom: 20 }}
          >
            Sign in to your workspace
          </h1>

          <label className="small">Email address</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="small">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p style={{ color: '#c44a4a', fontSize: 12 }}>
              {error}
            </p>
          )}

          <button
            className="btn"
            style={{ width: '100%', padding: 13, marginTop: 8 }}
          >
            Sign in →
          </button>

          <p
            className="small"
            style={{ marginTop: 22, lineHeight: 1.8 }}
          >
            Demo: owner@bright.test / Agency123!
            <br />
            Super Admin: admin@appzex.test / Admin123!
            <br />
            Client: client@north.test / Client123!
          </p>
        </form>
      </div>
    );
  }

  const isSuper = user.role === 'SUPER_ADMIN';
  const isClient = user.role === 'CLIENT';

  const nav = isSuper
    ? ['Overview', 'Agencies']
    : isClient
      ? ['Overview', 'My Projects', 'Feedback']
      : ['Overview', 'Projects', 'Clients', 'Feedback', 'Team'];

  const projects: Project[] = data?.projects || [];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Agency<span>Flow.</span>
        </div>

        <div>
          <div className="navlabel">WORKSPACE</div>

          {nav.map((n) => (
            <div
              key={n}
              onClick={() => setTab(n)}
              className={'navitem ' + (tab === n ? 'active' : '')}
            >
              <span>
                {
                  ({
                    Overview: '◫',
                    Agencies: '▦',
                    Projects: '▤',
                    'My Projects': '▤',
                    Clients: '♧',
                    Feedback: '◉',
                    Team: '♙',
                  } as any)[n]
                }
              </span>
              {n}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div className="navitem" onClick={logout}>
            ↪　Sign out
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <b style={{ fontSize: 13 }}>
              {isSuper
                ? 'Platform Console'
                : isClient
                  ? 'Client Portal'
                  : 'Agency Workspace'}
            </b>

            <div className="small">
              {isSuper ? 'AppZex Solutions' : user.name}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <b style={{ fontSize: 12 }}>{user.name}</b>
              <div className="small">
                {user.role.replace('_', ' ')}
              </div>
            </div>

            <div className="projectmark">{user.name[0]}</div>
          </div>
        </header>

        <div className="content">
          <div className="eyebrow">
            {isSuper
              ? 'PLATFORM MANAGEMENT'
              : isClient
                ? 'YOUR WORKSPACE'
                : 'AGENCY OVERVIEW'}
          </div>

          <h1 className="heading">
            {tab === 'Overview'
              ? isSuper
                ? 'Platform overview'
                : isClient
                  ? 'Welcome back'
                  : 'Good morning'
              : tab}
          </h1>

          <p className="muted">
            {tab === 'Overview'
              ? isSuper
                ? 'Monitor agencies and platform activity.'
                : isClient
                  ? 'Track your projects, updates and requests.'
                  : "Here’s what’s happening across your projects today."
              : `Manage ${tab.toLowerCase()} in one place.`}
          </p>

          {/* SUPER ADMIN */}
          {isSuper && (
            <>
              <div className="grid">
                {[
                  ['Total agencies', data?.agencies],
                  ['Active agencies', data?.active],
                  ['Total users', data?.users],
                  ['Projects', data?.projects],
                ].map(([x, v]) => (
                  <div className="card" key={String(x)}>
                    <div className="metric">
                      <span className="muted">{x}</span>
                      <span className="metricicon">▦</span>
                    </div>

                    <strong>{v ?? '—'}</strong>
                    <div className="small">Across the platform</div>
                  </div>
                ))}
              </div>

              <div className="sectionrow">
                <div className="sectiontitle">Agencies</div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <input
                    className="input"
                    style={{ maxWidth: 230, margin: 0 }}
                    placeholder="Search agencies"
                    onChange={async (e) => {
                      try {
                        setAgencies(
                          await call(
                            '/admin/agencies?q=' +
                              encodeURIComponent(e.target.value)
                          )
                        );
                      } catch {}
                    }}
                  />

                  <button
                    className="btn"
                    onClick={() => {
                      setForm({});
                      setModal('agency');
                    }}
                  >
                    ＋ Create Agency
                  </button>
                </div>
              </div>

              <div
                className="card"
                style={{ overflowX: 'auto' }}
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>AGENCY</th>
                      <th>CONTACT</th>
                      <th>USERS</th>
                      <th>CLIENTS</th>
                      <th>PROJECTS</th>
                      <th>STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {agencies.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <b>{a.name}</b>
                          <div className="small">
                            Created{' '}
                            {new Date(a.createdAt).toLocaleDateString()}
                          </div>
                        </td>

                        <td>{a.email}</td>
                        <td>{a._count.users}</td>
                        <td>{a._count.clients}</td>
                        <td>{a._count.projects}</td>

                        <td>
                          <span
                            className="pill"
                            style={{
                              background:
                                a.status === 'ACTIVE'
                                  ? '#edf8f1'
                                  : '#fff0f0',
                              color:
                                a.status === 'ACTIVE'
                                  ? '#23834d'
                                  : '#bf4a4a',
                            }}
                          >
                            {a.status}
                          </span>
                        </td>

                        <td>
                          <button
                            className="btn secondary"
                            onClick={() =>
                              updateStatus(
                                a.id,
                                a.status === 'ACTIVE'
                                  ? 'SUSPENDED'
                                  : 'ACTIVE'
                              )
                            }
                          >
                            {a.status === 'ACTIVE'
                              ? 'Suspend'
                              : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!agencies.length && (
                  <p className="muted">No agencies found.</p>
                )}
              </div>
            </>
          )}

          {/* AGENCY AND CLIENT DASHBOARDS */}
          {!isSuper && (
            <>
              <div className="grid">
                {(isClient
                  ? [
                      ['My projects', projects.length],
                      [
                        'Open feedback',
                        data?.feedbackList?.filter(
                          (f: any) =>
                            !['RESOLVED', 'DECLINED'].includes(f.status)
                        ).length,
                      ],
                      [
                        'Tasks in progress',
                        projects.reduce(
                          (n, p) =>
                            n +
                            p.tasks.filter(
                              (t) => t.status === 'IN_PROGRESS'
                            ).length,
                          0
                        ),
                      ],
                      [
                        'Completed tasks',
                        projects.reduce(
                          (n, p) =>
                            n +
                            p.tasks.filter((t) => t.status === 'DONE')
                              .length,
                          0
                        ),
                      ],
                    ]
                  : [
                      ['Clients', data?.clients],
                      [
                        'Active projects',
                        projects.filter((p) => p.status === 'ACTIVE')
                          .length,
                      ],
                      ['Open tasks', data?.tasks],
                      ['Pending feedback', data?.feedback],
                    ]
                ).map(([x, v], i) => (
                  <div className="card" key={String(x)}>
                    <div className="metric">
                      <span className="muted">{x}</span>
                      <span className="metricicon">
                        {['◫', '▤', '✓', '◉'][i]}
                      </span>
                    </div>

                    <strong>{v ?? '—'}</strong>
                    <div className="small">
                      {i === 0 ? 'Current workspace' : 'Updated live'}
                    </div>
                  </div>
                ))}
              </div>

              {/* PROJECTS */}
              {(tab === 'Overview' ||
                tab === 'Projects' ||
                tab === 'My Projects') && (
                <>
                  <div className="sectionrow">
                    <div className="sectiontitle">
                      {isClient ? 'Your projects' : 'Recent projects'}
                    </div>

                    {!isClient &&
                      user.role === 'AGENCY_ADMIN' && (
                        <button
                          className="btn"
                          onClick={() => {
                            setForm({ priority: 'MEDIUM' });
                            setModal('project');
                          }}
                        >
                          ＋ New project
                        </button>
                      )}
                  </div>

                  <div className="card">
                    {projects.length === 0 ? (
                      <p className="muted">No projects yet.</p>
                    ) : (
                      projects.map((p) => (
                        <div className="project" key={p.id}>
                          <div className="projectmark">
                            {p.name[0]}
                          </div>

                          <div className="projectinfo">
                            <b>{p.name}</b>

                            <div className="small">
                              {p.client?.company || 'Client'} ·{' '}
                              {p.priority} priority
                            </div>

                            <div className="bar">
                              <i
                                style={{
                                  width: `${p.progress || 0}%`,
                                }}
                              />
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign: 'right',
                              minWidth: 90,
                            }}
                          >
                            <span className="pill">
                              {p.status.replace('_', ' ')}
                            </span>

                            <div
                              className="small"
                              style={{ marginTop: 7 }}
                            >
                              {p.progress || 0}% complete
                            </div>
                          </div>

                          {!isClient && (
                            <button
                              className="btn secondary"
                              onClick={() => ai(p)}
                            >
                              AI update
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* CLIENTS */}
              {(tab === 'Overview' || tab === 'Clients') &&
                !isClient && (
                  <>
                    <div className="sectionrow">
                      <div className="sectiontitle">
                        Client companies
                      </div>

                      {user.role === 'AGENCY_ADMIN' && (
                        <button
                          className="btn"
                          onClick={() => {
                            setForm({});
                            setModal('client');
                          }}
                        >
                          ＋ Add client
                        </button>
                      )}
                    </div>

                    <div
                      className="card"
                      style={{ overflowX: 'auto' }}
                    >
                      <table className="table">
                        <thead>
                          <tr>
                            <th>COMPANY</th>
                            <th>CONTACT</th>
                            <th>EMAIL</th>
                            <th>PROJECTS</th>
                          </tr>
                        </thead>

                        <tbody>
                          {clients.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <b>{c.company}</b>
                              </td>
                              <td>{c.contactName}</td>
                              <td>{c.email}</td>
                              <td>{c._count?.projects ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {!clients.length && (
                        <p className="muted">No clients added.</p>
                      )}
                    </div>
                  </>
                )}

              {/* FEEDBACK */}
              {(tab === 'Overview' || tab === 'Feedback') && (
                <>
                  <div className="sectionrow">
                    <div className="sectiontitle">
                      {isClient ? 'Your feedback' : 'Client feedback'}
                    </div>
                  </div>

                  <div className="card">
                    {(data?.feedbackList || []).length === 0 ? (
                      <p className="muted">
                        No feedback requests yet.
                      </p>
                    ) : (
                      (data.feedbackList || []).map((f: any) => (
                        <div className="project" key={f.id}>
                          <div className="projectmark">◉</div>

                          <div className="projectinfo">
                            <b>{f.title}</b>

                            <div className="small">
                              {f.project?.name || 'Project'} ·{' '}
                              {f.description}
                            </div>
                          </div>

                          <span className="pill">
                            {f.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* TEAM */}
              {tab === 'Team' && (
                <div className="card">
                  <b>Team management</b>
                  <p className="muted">
                    Role-aware team access is enabled. Team
                    invitations and role editing are planned
                    extensions for this MVP.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* MODALS */}
      {modal && (
        <div
          className="overlay"
          onClick={() => setModal('')}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sectionrow"
              style={{ marginTop: 0 }}
            >
              <div className="sectiontitle">
                {modal === 'client'
                  ? 'Add client'
                  : modal === 'project'
                    ? 'Create project'
                    : modal === 'agency'
                      ? 'Create Agency'
                      : 'AI-generated client update'}
              </div>

              <button
                className="btn secondary"
                onClick={() => setModal('')}
              >
                ✕
              </button>
            </div>

            {/* AI UPDATE */}
            {modal === 'ai' ? (
              <>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {notice}
                </p>

                <button
                  className="btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(notice);
                    setModal('');
                  }}
                >
                  Copy update
                </button>
              </>
            ) : (
              <>
                {/* CREATE AGENCY */}
                {modal === 'agency' && (
                  <>
                    <label className="small">
                      Agency name
                    </label>
                    <input
                      className="input"
                      placeholder="Enter agency name"
                      value={form.name || ''}
                      onChange={(e) =>
                        set('name', e.target.value)
                      }
                    />

                    <label className="small">
                      Agency contact email
                    </label>
                    <input
                      className="input"
                      type="email"
                      placeholder="agency@example.com"
                      value={form.email || ''}
                      onChange={(e) =>
                        set('email', e.target.value)
                      }
                    />

                    <div className="sectiontitle" style={{ marginTop: 18 }}>
                      Agency Admin details
                    </div>

                    <label className="small">
                      Admin name
                    </label>
                    <input
                      className="input"
                      placeholder="Enter admin name"
                      value={form.adminName || ''}
                      onChange={(e) =>
                        set('adminName', e.target.value)
                      }
                    />

                    <label className="small">
                      Admin email
                    </label>
                    <input
                      className="input"
                      type="email"
                      placeholder="admin@example.com"
                      value={form.adminEmail || ''}
                      onChange={(e) =>
                        set('adminEmail', e.target.value)
                      }
                    />

                    <label className="small">
                      Admin password
                    </label>
                    <input
                      className="input"
                      type="password"
                      placeholder="At least 8 characters"
                      value={form.adminPassword || ''}
                      onChange={(e) =>
                        set('adminPassword', e.target.value)
                      }
                    />

                    <p className="small">
                      The admin will use these details to sign in
                      to the agency workspace.
                    </p>
                  </>
                )}

                {/* ADD CLIENT */}
                {modal === 'client' && (
                  <>
                    <label className="small">
                      Company name
                    </label>
                    <input
                      className="input"
                      value={form.company || ''}
                      onChange={(e) =>
                        set('company', e.target.value)
                      }
                    />

                    <label className="small">
                      Contact person
                    </label>
                    <input
                      className="input"
                      value={form.contactName || ''}
                      onChange={(e) =>
                        set('contactName', e.target.value)
                      }
                    />

                    <label className="small">Email</label>
                    <input
                      className="input"
                      type="email"
                      value={form.email || ''}
                      onChange={(e) =>
                        set('email', e.target.value)
                      }
                    />

                    <label className="small">
                      Phone (optional)
                    </label>
                    <input
                      className="input"
                      value={form.phone || ''}
                      onChange={(e) =>
                        set('phone', e.target.value)
                      }
                    />
                  </>
                )}

                {/* CREATE PROJECT */}
                {modal === 'project' && (
                  <>
                    <label className="small">
                      Project name
                    </label>
                    <input
                      className="input"
                      value={form.name || ''}
                      onChange={(e) =>
                        set('name', e.target.value)
                      }
                    />

                    <label className="small">
                      Description
                    </label>
                    <textarea
                      className="input"
                      rows={3}
                      value={form.description || ''}
                      onChange={(e) =>
                        set('description', e.target.value)
                      }
                    />

                    <label className="small">
                      Client company
                    </label>
                    <select
                      className="input"
                      value={form.clientId || ''}
                      onChange={(e) =>
                        set('clientId', Number(e.target.value))
                      }
                    >
                      <option value="">Choose a client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company}
                        </option>
                      ))}
                    </select>

                    <label className="small">
                      Priority
                    </label>
                    <select
                      className="input"
                      value={form.priority || 'MEDIUM'}
                      onChange={(e) =>
                        set('priority', e.target.value)
                      }
                    >
                      <option>LOW</option>
                      <option>MEDIUM</option>
                      <option>HIGH</option>
                      <option>URGENT</option>
                    </select>
                  </>
                )}

                <button
                  className="btn"
                  disabled={
                    busy ||
                    (modal === 'agency' &&
                      (!form.name?.trim() ||
                        !form.email?.trim() ||
                        !form.adminName?.trim() ||
                        !form.adminEmail?.trim() ||
                        !form.adminPassword ||
                        form.adminPassword.length < 8))
                  }
                  onClick={submit}
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 18,
            right: 18,
            background: '#fff0f0',
            color: '#a33',
            padding: 13,
            borderRadius: 9,
            fontSize: 12,
          }}
        >
          {error}

          <button
            onClick={() => setError('')}
            style={{
              marginLeft: 10,
              border: 0,
              background: 'none',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}