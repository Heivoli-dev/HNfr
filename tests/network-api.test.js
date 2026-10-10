import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { networkAPI } from '../discord-worker/src/network.js';
let account;
before(async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
  account={client_email:'network-test@example.com',private_key:`-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`};
});
const request=(body,path='permit',extra={})=>{
  const r=new Request(`https://worker.test/api/${path}`,{method:'POST',headers:{Origin:'https://heivoli-network.fr',Authorization:'Bearer fake-test-token','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body),...extra});
  Object.defineProperty(r,'cf',{value:{}}); return r;
};
async function run(body,{uid='alice',founder=false,ipBanned=false,accountBanned=false,history=true,path='permit'}={}) {
  const original=global.fetch,commits=[];
  global.fetch=async(url,options={})=>{
    url=String(url);
    if(url.includes('accounts:lookup')) return Response.json({users:[{localId:uid,email:founder?'heivolipro@gmail.com':'alice@example.com',emailVerified:true}]});
    if(url==='https://oauth2.googleapis.com/token') return Response.json({access_token:'test-oauth'});
    if(url.endsWith(':commit')) {commits.push(JSON.parse(options.body).writes); return Response.json({writeResults:[]});}
    if(url.includes('/networkBans/') && ipBanned || url.endsWith(`/bans/${uid}`) && accountBanned) return Response.json({fields:{reason:{stringValue:'Spam'},expiresAt:{nullValue:null}}});
    if(url.includes('/networkUsers/') && history) return Response.json({fields:{ipHash:{stringValue:'a'.repeat(64)},expiresAt:{timestampValue:new Date(Date.now()+60000).toISOString()}}});
    return new Response('',{status:404});
  };
  try {const response=await networkAPI(request(body,path),{FIREBASE_SERVICE_ACCOUNT:JSON.stringify(account)}); return {status:response.status,data:await response.json(),commits};}
  finally {global.fetch=original;}
}
test('IP control rejects wrong origin and missing authentication',async()=>{
  assert.equal((await networkAPI(request({},'permit',{headers:{Origin:'https://evil.example'}}),{})).status,403);
  assert.equal((await networkAPI(request({},'permit',{headers:{Origin:'https://heivoli-network.fr'}}),{})).status,401);
});
test('a permit is bound to the account and target, stores no raw IP and blocks new accounts on a banned connection',async()=>{
  const ok=await run({action:'comment',target:'a/c'}); assert.equal(ok.status,200);
  const permit=ok.commits[0][0].update.fields;
  assert.equal(permit.uid.stringValue,'alice'); assert.equal(permit.target.stringValue,'a/c');
  assert.match(permit.ipHash.stringValue,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(ok.commits).includes('192.0.2.1'));
  assert.equal((await run({action:'ticket',target:'t'},{uid:'new-account',ipBanned:true})).status,403);
  assert.equal((await run({action:'ticket',target:'t'},{accountBanned:true})).status,403);
  assert.equal((await run({action:'unknown',target:'t'})).status,400);
});
test('only moderators can ban connections; absent history never fabricates an IP',async()=>{
  const body={uid:'bob',reason:'Spam',hours:24};
  assert.equal((await run(body,{path:'network-ban'})).status,403);
  assert.equal((await run(body,{path:'network-ban',founder:true,history:false})).status,409);
  const ok=await run(body,{path:'network-ban',founder:true}); assert.equal(ok.status,200);
  assert.equal(ok.commits[0].length,2); assert.ok(ok.commits[0][0].update.name.endsWith('/bans/bob'));
  assert.equal((await run({...body,hours:-1},{path:'network-ban',founder:true})).status,400);
});
