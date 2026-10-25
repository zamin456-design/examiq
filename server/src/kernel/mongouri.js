// Some networks (routers, providers, VPNs) refuse the special DNS "SRV" lookup that mongodb+srv:// addresses need.
// This asks the same question over normal HTTPS (port 443) and builds the long mongodb:// address from the answer.
const PROVIDERS = [
  (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`,
  (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`,
];
async function doh(name, type) {
  let last;
  for (const mk of PROVIDERS) {
    try {
      const r = await fetch(mk(name, type), { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return (await r.json()).Answer || [];
    } catch (e) { last = e; }
  }
  throw new Error('DNS-over-HTTPS failed: ' + (last && last.message));
}
function buildUri(uri, srv, txt) {
  const u = new URL(uri);
  const hosts = srv.filter((a) => a.type === 33).map((a) => { const p = String(a.data).trim().split(/\s+/); return `${p[3].replace(/\.$/, '')}:${p[2]}`; });
  if (!hosts.length) throw new Error('No database servers found for ' + u.hostname);
  const params = new URLSearchParams(u.search);
  for (const a of txt.filter((x) => x.type === 16)) {
    const s = (String(a.data).match(/"([^"]*)"/g) || [String(a.data)]).map((x) => x.replace(/"/g, '')).join('');
    for (const [k, v] of new URLSearchParams(s)) if (!params.has(k)) params.set(k, v);
  }
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  const auth = u.username ? u.username + (u.password ? ':' + u.password : '') + '@' : '';
  return `mongodb://${auth}${hosts.join(',')}${u.pathname && u.pathname !== '/' ? u.pathname : '/'}?${params}`;
}
async function resolveSrvUri(uri) {
  const host = new URL(uri).hostname;
  const [srv, txt] = await Promise.all([doh('_mongodb._tcp.' + host, 'SRV'), doh(host, 'TXT')]);
  return buildUri(uri, srv, txt);
}
const isDnsProblem = (e) => /querySrv|querytxt|ENOTFOUND|ECONNREFUSED|ETIMEOUT|EAI_AGAIN/i.test(String((e && (e.message + ' ' + e.code + ' ' + e.syscall)) || e));
async function connectDb(mongoose, uri) {
  const opts = { serverSelectionTimeoutMS: 15000 };
  try { return await mongoose.connect(uri, opts); }
  catch (e) {
    if (!uri.startsWith('mongodb+srv://') || !isDnsProblem(e)) throw e;
    console.log('Your network blocks the special database address lookup. Using the built-in fallback...');
    return mongoose.connect(await resolveSrvUri(uri), opts);
  }
}
function friendly(e) {
  const m = String((e && e.message) || e);
  if (/EADDRINUSE|address already in use/i.test(m)) return 'Cannot start the API because its port is already in use. Stop the existing server or set PORT to another available port.';
  if (/bad auth|Authentication failed/i.test(m)) return 'Database login failed: the username or password in MONGO_URI is wrong (use letters and numbers only in the password).';
  if (/DNS-over-HTTPS|No database servers/i.test(m)) return 'Could not find the database address. Check your internet connection, or paste the long mongodb:// address from Atlas into MONGO_URI (see README).';
  if (/selection|ReplicaSetNoPrimary|ETIMEDOUT|timed out/i.test(m)) return 'Cannot reach the database. In MongoDB Atlas open Network Access, allow your IP address (or "Allow access from anywhere"), wait one minute, then try again.';
  return m;
}
module.exports = { buildUri, resolveSrvUri, connectDb, friendly, isDnsProblem };