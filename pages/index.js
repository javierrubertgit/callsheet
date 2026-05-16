import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const RESULTS = [
  { k: 'reached', label: 'Reached ✓', color: '#0F6E56', bg: '#E1F5EE', border: '#5DCAA5' },
  { k: 'vm', label: 'Voicemail', color: '#854F0B', bg: '#FAEEDA', border: '#EF9F27' },
  { k: 'busy', label: 'Busy / Wrong #', color: '#A32D2D', bg: '#FCEBEB', border: '#F09595' },
  { k: 'noanswer', label: 'No answer', color: '#555', bg: '#f0efea', border: '#B4B2A9' },
  { k: 'callback', label: 'Callback req.', color: '#185FA5', bg: '#dbeeff', border: '#85B7EB' },
  { k: 'done', label: '✓ Done', color: '#3B6D11', bg: '#d8f0c4', border: '#97C459' },
];

function fmt$(n) {
  if (!n) return '—';
  return '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function initials(l) {
  return ((l.firstName || '?')[0] + (l.lastName || '?')[0]).toUpperCase();
}

function getKey(l) {
  return l._key || (l.phone + '|' + l.org);
}

function getVal(l) {
  return l.monthly || l.upfront || 0;
}

export default function Home() {
  const [leads, setLeads] = useState([]);
  const [state, setState] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [filterStatus, setFilterStatus] = useState('pending');
  const [filterResult, setFilterResult] = useState('all');
  const [filterSort, setFilterSort] = useState('priority');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState({});
  const [form, setForm] = useState({
    firstName: '', lastName: '', title: '', org: '', phone: '', email: '',
    quoteName: '', quoteNum: '', monthly: '', upfront: '', created: new Date().toISOString().split('T')[0], expiry: '', expired: 'false'
  });

  useEffect(() => {
    fetch('/api/data')
      .then(r => r.json())
      .then(d => {
        const ls = d.leads.map(l => ({ ...l, _key: l._key || (l.phone + '|' + l.org) }));
        setLeads(ls);
        setState(d.state || {});
        setLoading(false);
      });
  }, []);

  const apiPost = useCallback(async (action, payload) => {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
  }, []);

  const setResult = useCallback((key, result) => {
    setState(prev => ({ ...prev, [key]: { ...prev[key], result } }));
    setSaving(s => ({ ...s, [key]: true }));
    apiPost('updateState', { key, result }).then(() => setSaving(s => ({ ...s, [key]: false })));
  }, [apiPost]);

  const setNote = useCallback((key, note) => {
    setState(prev => ({ ...prev, [key]: { ...prev[key], note } }));
    apiPost('updateState', { key, note });
  }, [apiPost]);

  const removeLead = useCallback((key) => {
    if (!confirm('Remove this lead from the list?')) return;
    setLeads(prev => prev.filter(l => l._key !== key));
    setState(prev => { const n = { ...prev }; delete n[key]; return n; });
    apiPost('removeLead', { key });
  }, [apiPost]);

  const addLead = useCallback(() => {
    if (!form.firstName || !form.lastName || !form.org || !form.phone) {
      alert('First name, last name, organization, and phone are required.');
      return;
    }
    const created = form.created || new Date().toISOString().split('T')[0];
    const daysSince = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
    const lead = {
      ...form,
      quoteNum: parseInt(form.quoteNum) || 0,
      monthly: parseFloat(form.monthly) || null,
      upfront: parseFloat(form.upfront) || null,
      expired: form.expired === 'true',
      expiry: form.expiry || null,
      daysSince,
      created,
    };
    lead._key = lead.phone + '|' + lead.org;
    setLeads(prev => [lead, ...prev]);
    setState(prev => ({ ...prev, [lead._key]: { result: 'pending', note: '' } }));
    setShowAdd(false);
    setForm({ firstName: '', lastName: '', title: '', org: '', phone: '', email: '', quoteName: '', quoteNum: '', monthly: '', upfront: '', created: new Date().toISOString().split('T')[0], expiry: '', expired: 'false' });
    apiPost('addLead', lead);
  }, [form, apiPost]);

  const filtered = useCallback(() => {
    const q = search.toLowerCase();
    let list = leads.filter(l => {
      const key = l._key;
      const s = state[key] || {};
      if (filterStatus === 'pending' && (l.expired || ['won','accepted','ordered','lost'].includes((l.status||'').toLowerCase()))) return false;
      if (filterStatus === 'active' && l.expired) return false;
      if (filterStatus === 'expired' && !l.expired) return false;
      if (filterStatus === 'won' && !['won','accepted','ordered'].includes((l.status||'').toLowerCase())) return false;
      if (filterStatus === 'lost' && (l.status||'').toLowerCase() !== 'lost') return false;
      if (filterResult !== 'all' && (s.result || 'pending') !== filterResult) return false;
      if (q && !(l.firstName + ' ' + l.lastName + ' ' + l.org).toLowerCase().includes(q)) return false;
      return true;
    });
    if (filterSort === 'value') list.sort((a, b) => getVal(b) - getVal(a));
    else if (filterSort === 'age') list.sort((a, b) => a.daysSince - b.daysSince);
    else list.sort((a, b) => {
      if (a.expired !== b.expired) return a.expired ? 1 : -1;
      return a.daysSince - b.daysSince;
    });
    return list;
  }, [leads, state, filterStatus, filterResult, filterSort, search]);

  const total = leads.length;
  const active = leads.filter(l => !l.expired).length;
  const done = Object.values(state).filter(s => s.result === 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const list = filtered();

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui, sans-serif', color: '#888' }}>
      Loading call sheet…
    </div>
  );

  return (
    <>
      <Head>
        <title>Conecta Cloud — Call Sheet</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ background: '#f5f5f3', minHeight: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize: 15 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem' }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0F6E56', flex: 1 }}>
              Conecta Cloud <span style={{ color: '#1a1a18', fontWeight: 400 }}>— Call Sheet</span>
            </div>
            <Btn onClick={() => setShowAdd(true)}>+ Add lead</Btn>
            <Btn as="a" href="/api/export">⬇ Export CSV</Btn>
            <Btn onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }} style={{ background: "#fff", color: "#888", border: "1px solid #e8e8e2" }}>Sign out</Btn>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1rem' }}>
            {[
              { n: total, l: 'Total leads', color: '#1a1a18' },
              { n: active, l: 'Active quotes', color: '#0F6E56' },
              { n: done, l: 'Completed', color: '#1a1a18' },
              { n: pct + '%', l: 'Progress', color: '#1a1a18' },
            ].map(({ n, l, color }) => (
              <div key={l} style={{ background: '#fff', border: '1px solid #e8e8e2', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color }}>{n}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ height: 5, background: '#e8e8e2', borderRadius: 3, marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#0F6E56', borderRadius: 3, width: pct + '%', transition: 'width .4s' }} />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
            {[
              { id: 'fStatus', val: filterStatus, set: setFilterStatus, opts: [['pending','Pending only'],['all','All leads'],['active','Active only'],['expired','Expired only'],['won','Won/Ordered'],['lost','Lost']] },
              { id: 'fResult', val: filterResult, set: setFilterResult, opts: [['all','All results'],['pending','Not called'],['reached','Reached'],['vm','Voicemail'],['busy','Busy'],['noanswer','No answer'],['callback','Callback'],['done','Done']] },
              { id: 'fSort', val: filterSort, set: setFilterSort, opts: [['priority','Sort: priority'],['value','Sort: value ↓'],['age','Sort: newest first']] },
            ].map(({ id, val, set, opts }) => (
              <select key={id} value={val} onChange={e => set(e.target.value)} style={selStyle}>
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <input type="text" placeholder="Search name or company…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...selStyle, flex: 1, minWidth: 140 }} />
          </div>

          {/* Lead list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#aaa', fontSize: 14 }}>No leads match these filters.</div>
            )}
            {list.map(l => {
              const key = l._key;
              const s = state[key] || { result: 'pending', note: '' };
              const isExpanded = !!expanded[key];
              const isDone = s.result === 'done';
              const isNew = l.daysSince <= 3;
              const badgeColor = isDone ? '#3B6D11' : l.expired ? '#777' : isNew ? '#185FA5' : '#0F6E56';
              const badgeBg = isDone ? '#d8f0c4' : l.expired ? '#f0efea' : isNew ? '#dbeeff' : '#E1F5EE';
              const badgeText = isDone ? 'Done' : l.expired ? 'Expired' : isNew ? 'New' : 'Active';
              const avBg = isDone ? '#d8f0c4' : l.expired ? '#f0efea' : '#E1F5EE';
              const avColor = isDone ? '#3B6D11' : l.expired ? '#888' : '#0F6E56';
              const valLabel = l.monthly ? fmt$(l.monthly) + '/mo' : l.upfront ? fmt$(l.upfront) + ' 1×' : '';

              return (
                <div key={key} style={{
                  background: '#fff', border: `1px solid ${isExpanded ? '#1D9E75' : '#e8e8e2'}`,
                  borderRadius: 12, padding: '13px 16px', cursor: 'pointer',
                  opacity: isDone ? 0.5 : 1, transition: 'border-color .15s'
                }} onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}>

                  {/* Card top */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: avBg, color: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      {initials(l)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.firstName} {l.lastName}</div>
                      <div style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.org}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 500, background: badgeBg, color: badgeColor }}>{badgeText}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{valLabel}</span>
                      <span style={{ fontSize: 18, color: '#aaa', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', userSelect: 'none' }}>⌄</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0ea' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 14 }}>
                        {[
                          ['Phone', <a href={`tel:${l.phone}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{l.phone || '—'}</a>],
                          ['Email', <a href={`mailto:${l.email}`} style={{ color: '#185FA5', textDecoration: 'none' }}>{l.email || '—'}</a>],
                          ['Title', l.title || '—'],
                          ['Quote #', l.quoteNum || '—'],
                          ['Quote', l.quoteName || '—'],
                          ['Sent / Expiry', l.created + (l.expiry ? ' → ' + l.expiry : '')],
                          ['Monthly', fmt$(l.monthly)],
                          ['Upfront', fmt$(l.upfront)],
                          ...(l.quoteUrl ? [['Quote Link', <a href={l.quoteUrl} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'none' }}>View Quote ↗</a>]] : []),
                        ].map(([label, val]) => (
                          <div key={label}>
                            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                            <div style={{ fontSize: 13 }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Result pills */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 7 }}>Call result {saving[key] && <span style={{ color: '#1D9E75' }}>saving…</span>}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {RESULTS.map(r => {
                            const sel = s.result === r.k;
                            return (
                              <span key={r.k} onClick={() => setResult(key, r.k)} style={{
                                fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                                border: `1px solid ${sel ? r.border : '#ddd'}`,
                                background: sel ? r.bg : '#f8f8f5',
                                color: sel ? r.color : '#555',
                                fontWeight: sel ? 600 : 400,
                                transition: 'all .15s'
                              }}>{r.label}</span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Notes */}
                      <textarea
                        defaultValue={s.note || ''}
                        placeholder="Call notes — what was said, follow-up needed, best time to call back…"
                        onBlur={e => setNote(key, e.target.value)}
                        style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #d0d0ca', borderRadius: 8, background: '#fafaf8', color: '#1a1a18', resize: 'vertical', minHeight: 64, fontFamily: 'inherit', outline: 'none' }}
                      />

                      {/* Remove */}
                      <button onClick={() => removeLead(key)} style={{ marginTop: 10, fontSize: 12, padding: '5px 12px', border: '1px solid #f0c0c0', borderRadius: 8, background: '#fff', color: '#c0392b', cursor: 'pointer' }}>
                        ✕ Remove from list
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add lead modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: '1.25rem' }}>Add new lead</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="First name *" value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} />
              <Field label="Last name *" value={form.lastName} onChange={v => setForm(f => ({ ...f, lastName: v }))} />
              <Field label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
              <Field label="Organization *" value={form.org} onChange={v => setForm(f => ({ ...f, org: v }))} />
              <Field label="Phone *" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              <Field label="Email" value={form.email} type="email" onChange={v => setForm(f => ({ ...f, email: v }))} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <Field label="Quote name" value={form.quoteName} onChange={v => setForm(f => ({ ...f, quoteName: v }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Quote #" value={form.quoteNum} type="number" onChange={v => setForm(f => ({ ...f, quoteNum: v }))} />
              <div>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 4 }}>Status</div>
                <select value={form.expired} onChange={e => setForm(f => ({ ...f, expired: e.target.value }))} style={{ ...selStyle, width: '100%' }}>
                  <option value="false">Active</option>
                  <option value="true">Expired</option>
                </select>
              </div>
              <Field label="Monthly total ($)" value={form.monthly} type="number" onChange={v => setForm(f => ({ ...f, monthly: v }))} />
              <Field label="Upfront total ($)" value={form.upfront} type="number" onChange={v => setForm(f => ({ ...f, upfront: v }))} />
              <Field label="Created date" value={form.created} type="date" onChange={v => setForm(f => ({ ...f, created: v }))} />
              <Field label="Expiry date" value={form.expiry} type="date" onChange={v => setForm(f => ({ ...f, expiry: v }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn primary onClick={addLead}>Add lead</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Btn({ children, onClick, primary, as, href }) {
  const style = {
    fontSize: 13, padding: '7px 14px', border: `1px solid ${primary ? '#0F6E56' : '#c8c8c2'}`,
    borderRadius: 8, background: primary ? '#0F6E56' : '#fff', color: primary ? '#fff' : '#444',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
  };
  if (as === 'a') return <a href={href} style={style}>{children}</a>;
  return <button onClick={onClick} style={style}>{children}</button>;
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#888', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #d0d0ca', borderRadius: 8, background: '#fff', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
    </div>
  );
}

const selStyle = { fontSize: 13, padding: '7px 10px', border: '1px solid #d0d0ca', borderRadius: 8, background: '#fff', color: '#1a1a18', outline: 'none' };
