import { useState } from 'react';
import { useRouter } from 'next/router';
export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) { router.push('/'); } else { setError('Incorrect password'); setLoading(false); }
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4f8', fontFamily:'sans-serif' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'48px 40px', boxShadow:'0 4px 24px rgba(0,0,0,0.1)', width:340 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📞</div>
          <h1 style={{ margin:0, fontSize:22, color:'#1a202c' }}>Conecta Call Sheet</h1>
          <p style={{ margin:'8px 0 0', color:'#718096', fontSize:14 }}>Enter your password to continue</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoFocus
            style={{ width:'100%', padding:'12px 16px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:16, boxSizing:'border-box' }} />
          {error && <p style={{ color:'#e53e3e', fontSize:13, margin:'8px 0 0' }}>{error}</p>}
          <button type="submit" disabled={loading || !password}
            style={{ width:'100%', marginTop:16, padding:12, background:'#0F6E56', color:'#fff', border:'none', borderRadius:8, fontSize:16, cursor:'pointer', opacity: loading || !password ? 0.6 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
