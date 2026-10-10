const PROJECT = 'heivoli-network-408f3';
const API_KEY = 'AIzaSyDKXFI0a1H1lnWIRI-qXor45RQ5R5qAMJk';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const URL_ROOT = `https://firestore.googleapis.com/v1/${ROOT}`;
const SITE = 'https://heivoli-network.fr';
const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
let cachedToken;
async function serviceToken(account) {
  if (cachedToken?.email === account.client_email && cachedToken.until > Date.now()) return cachedToken.token;
  const now = Math.floor(Date.now()/1000);
  const unsigned = `${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g,'');
  const key = await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned)));
  const jwt = unsigned+'.'+btoa(String.fromCharCode(...signature)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if (!response.ok) throw new Error('Serveur de modération indisponible.');
  const data = await response.json(); cachedToken={email:account.client_email,token:data.access_token,until:Date.now()+3000000}; return data.access_token;
}
const field = value => value === null ? {nullValue:null} : typeof value === 'number' ? {integerValue:String(value)} : {stringValue:value};
const timestamp = value => ({timestampValue:new Date(value).toISOString()});
const decode = doc => doc?.fields ? Object.fromEntries(Object.entries(doc.fields).map(([key,v])=>[key,v.stringValue ?? v.timestampValue ?? (v.integerValue ? Number(v.integerValue) : null)])) : null;
const active = ban => !!ban && (ban.expiresAt === null || Date.parse(ban.expiresAt)>Date.now());
export async function networkAPI(request,env) {
  const headers={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':SITE,'Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(request.headers.get('Origin')!==SITE) return reply({error:'Origine refusée.'},403);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
  if(request.method==='GET' && new URL(request.url).pathname==='/api/health') {
    try {
      const token=await serviceToken(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT));
      const check=await fetch(`${URL_ROOT}/networkBans/__health`,{headers:{Authorization:`Bearer ${token}`}});
      return reply({ready:check.ok||check.status===404},check.ok||check.status===404?200:503);
    } catch { return reply({ready:false},503); }
  }
  if(request.method!=='POST') return reply({error:'Méthode refusée.'},405);
  try {
    const bearer=request.headers.get('Authorization')||'';
    if(!bearer.startsWith('Bearer ')) return reply({error:'Connecte-toi pour continuer.'},401);
    const lookup=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer.slice(7)})});
    if(!lookup.ok) return reply({error:'Reconnecte-toi pour continuer.'},401);
    const user=(await lookup.json()).users?.[0];
    if(!user?.localId || user.disabled) return reply({error:'Compte indisponible.'},401);
    if(Number(request.headers.get('Content-Length')||0)>4096) return reply({error:'Demande trop longue.'},413);
    const bodyText=await request.text(); if(bodyText.length>4096) return reply({error:'Demande trop longue.'},413);
    const body=JSON.parse(bodyText), account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const token=await serviceToken(account);
    const api=async(path,options={})=>{
      const result=await fetch(`${URL_ROOT}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
      if(result.status===404 && !options.method) return null;
      if(!result.ok) throw new Error('Serveur de modération indisponible.');
      return result.json();
    };
    const read=async path=>decode(await api('/'+path));
    const commit=writes=>api(':commit',{method:'POST',body:JSON.stringify({writes})});
    const update=(path,fields)=>({update:{name:`${ROOT}/${path}`,fields}});
    const founder=user.emailVerified && user.email==='heivolipro@gmail.com';
    const ownBan=await read(`bans/${user.localId}`);
    if(!founder && active(ownBan)) return reply({error:`Compte banni. Motif : ${ownBan.reason}`},403);
    const path=new URL(request.url).pathname;
    if(path==='/api/network-ban' || path==='/api/network-unban') {
      const admin=founder || (user.emailVerified && user.email && !!await read(`admins/${encodeURIComponent(user.email)}`));
      if(!admin) return reply({error:'Accès réservé à la modération.'},403);
      if(path.endsWith('unban')) {
        if(!/^[a-f0-9]{64}$/.test(body.id||'')) return reply({error:'Bannissement invalide.'},400);
        await commit([{delete:`${ROOT}/networkBans/${body.id}`}]); return reply({ok:true});
      }
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(body.uid||'') || body.uid===user.localId || typeof body.reason!=='string' || !body.reason.trim() || body.reason.length>300 || ![1,24,168,720,'permanent'].includes(body.hours)) return reply({error:'Compte, motif ou durée invalide.'},400);
      const history=await read(`networkUsers/${body.uid}`);
      if(!history?.ipHash || Date.parse(history.expiresAt)<Date.now()) return reply({error:'Aucune connexion récente enregistrée pour ce compte. Tu peux le bannir par compte.'},409);
      const expiry=body.hours==='permanent'?{nullValue:null}:timestamp(Date.now()+body.hours*3600000);
      const fields={reason:field(body.reason.trim()),expiresAt:expiry,createdAt:timestamp(Date.now()),createdBy:field(user.localId)};
      await commit([update(`bans/${body.uid}`,fields),update(`networkBans/${history.ipHash}`,{...fields,uid:field(body.uid)})]); return reply({ok:true});
    }
    if(path!=='/api/permit') return reply({error:'Route inconnue.'},404);
    const patterns={comment:/^[A-Za-z0-9_-]{1,1500}\/[A-Za-z0-9_-]{1,128}$/,ticket:/^[A-Za-z0-9_-]{1,128}$/,message:/^[A-Za-z0-9_-]{1,1500}\/[A-Za-z0-9_-]{1,128}$/};
    if(!patterns[body.action]?.test(body.target||'')) return reply({error:'Demande invalide.'},400);
    const ip=request.headers.get('CF-Connecting-IPv6')||request.headers.get('CF-Connecting-IP');
    if(!ip || !request.cf) return reply({error:'Connexion non vérifiable.'},403);
    const hashKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(account.private_key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const ipHash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',hashKey,new TextEncoder().encode(ip.toLowerCase()))),v=>v.toString(16).padStart(2,'0')).join('');
    const networkBan=await read(`networkBans/${ipHash}`);
    if(!founder && active(networkBan)) return reply({error:`Cette connexion est bannie. Motif : ${networkBan.reason}. Les annonces restent accessibles.`},403);
    const id=crypto.randomUUID(), now=Date.now();
    await commit([
      {...update(`writePermits/${id}`,{uid:field(user.localId),action:field(body.action),target:field(body.target),ipHash:field(ipHash),expiresAt:timestamp(now+60000),usedAt:{nullValue:null}}),currentDocument:{exists:false}},
      update(`networkUsers/${user.localId}`,{ipHash:field(ipHash),expiresAt:timestamp(now+30*86400000)})
    ]);
    return reply({id});
  } catch { return reply({error:'Le contrôle de connexion est indisponible. Réessaie dans un instant.'},503); }
}
