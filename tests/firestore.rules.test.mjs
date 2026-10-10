import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc as rawSetDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
async function grant(uid, action, target, ipHash = 'test-ip') {
  const id = crypto.randomUUID();
  await env.withSecurityRulesDisabled(ctx => rawSetDoc(doc(ctx.firestore(), 'writePermits', id), {uid,action,target,ipHash,expiresAt:new Date(Date.now()+60000),usedAt:null}));
  return id;
}
async function setDoc(ref, data) {
  if (ref.path.startsWith('profiles/')) {
    const uid = ref.path.split('/')[1], networkPermit = await grant(uid, 'profile', uid);
    const batch = writeBatch(ref.firestore); batch.set(ref,{...data,networkPermit});
    batch.update(doc(ref.firestore,'writePermits',networkPermit),{usedAt:serverTimestamp()}); return batch.commit();
  }
  if (!ref.path.startsWith('tickets/')) return rawSetDoc(ref,data);
  const parts=ref.path.split('/'), action=parts.length===2?'ticket':'message';
  const target=action==='ticket'?parts[1]:parts[1]+'/'+parts[3];
  const networkPermit=await grant(data.creatorId||data.authorId,action,target);
  const batch=writeBatch(ref.firestore);
  batch.set(ref,{...data,networkPermit}); batch.update(doc(ref.firestore,'writePermits',networkPermit),{usedAt:serverTimestamp()});
  return batch.commit();
}
let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-heivoli', firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const user = (uid = 'alice', token = {}) => env.authenticatedContext(uid, token).firestore();
const founder = (verified = true) => user('founder', { email: 'heivolipro@gmail.com', email_verified: verified });
const ticket = (extra = {}) => ({ creatorId: 'alice', creatorName: 'Alice', creatorEmail: '', subject: 'Question', category: 'Question', status: 'open', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
const message = (extra = {}) => ({ authorId: 'alice', authorName: 'Alice', authorIsModerator: false, text: 'Bonjour', createdAt: serverTimestamp(), ...extra });
const announcement = { type: 'Bienvenue', title: 'Bonjour', text: 'Bienvenue', date: 'Aujourd’hui', featured: false, createdAt: serverTimestamp() };
const comment = (extra = {}) => ({ authorId: 'alice', authorName: 'Membre', text: 'Super projet !', createdAt: serverTimestamp(), ...extra });
async function post(db, id = 'c', extra = {}, uid = 'alice', announcementId = 'a') {
  const data = comment(extra), batch = writeBatch(db);
  const networkPermit = await grant(uid, 'comment', announcementId+'/'+id);
  batch.set(doc(db, `announcements/${announcementId}/comments/${id}`), {...data,networkPermit});
  batch.update(doc(db,'writePermits',networkPermit),{usedAt:serverTimestamp()});
  batch.set(doc(db, `commentThrottle/${uid}`), { createdAt: serverTimestamp(), lastText: data.text.toLowerCase(), commentId: id, announcementId });
  return batch.commit();
}
async function ageThrottle(text = 'ancien message') {
  await env.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(), 'commentThrottle/alice'), { createdAt: new Date(Date.now() - 60000), lastText: text, commentId: 'old', announcementId: 'a' }));
}
test('comments require authentication, a real announcement and an atomic cooldown record', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  await assertFails(setDoc(doc(user(), 'announcements/a/comments/direct'), comment()));
  await assertFails(post(env.unauthenticatedContext().firestore()));
  await assertFails(post(user(), 'missing', {}, 'alice', 'missing'));
  await assertSucceeds(post(user()));
  await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'announcements/a/comments')));
  await assertFails(getDoc(doc(user('bob'), 'commentThrottle/alice')));
  await assertSucceeds(post(user('bob', { name: 'Bob' }), 'bob', { authorId: 'bob', authorName: 'Bob', text: 'Bonjour\nà tous !' }, 'bob'));
  const avatar = 'https://cdn.discordapp.com/avatars/123/photo.png';
  await assertSucceeds(post(user('discord', { discordName: 'Discord member', discordAvatar: avatar }), 'discord', { authorId: 'discord', authorName: 'Discord member', authorPhotoURL: avatar }, 'discord'));
});
test('server moderation blocks insults, links, forged identity, oversized text and edits', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  for (const extra of [{authorId:'bob'}, {authorName:'Fondateur'}, {authorPhotoURL:'https://example.org/a.png'}, {text:''}, {text:'  \n '}, {text:'x'.repeat(801)}, {text:'CONNARD !'}, {text:'Salut\nfdp'}, {text:'https://example.org'}, {text:'discord.gg/test'}, {createdAt:new Date(0)}, {admin:true}]) await assertFails(post(user(), 'bad', extra));
  await assertSucceeds(post(user()));
  await assertFails(updateDoc(doc(user(), 'announcements/a/comments/c'), {text:'edited'}));
});
test('cooldown and duplicate protection survive bypasses and concurrent submissions', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  await assertSucceeds(post(user()));
  await assertFails(post(user(), 'fast', {text:'Un autre avis'}));
  await assertFails(deleteDoc(doc(user(), 'commentThrottle/alice')));
  await ageThrottle('super projet !');
  await assertFails(post(user(), 'duplicate'));
  await assertSucceeds(post(user(), 'later', {text:'Un autre avis'}));
  await ageThrottle();
  const results = await Promise.allSettled([post(user(), 'parallel1', {text:'Un premier avis'}), post(user(), 'parallel2', {text:'Un deuxième avis'})]);
  if (results.filter(r => r.status === 'fulfilled').length !== 1) throw new Error('Expected exactly one concurrent write to succeed');
});
test('only authors or moderators delete comments and deleted announcements hide discussion', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  const path = 'announcements/a/comments/c';
  await post(user());
  await assertFails(deleteDoc(doc(user('bob'), path)));
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), path)));
  await assertSucceeds(deleteDoc(doc(user(), path)));
  await ageThrottle(); await post(user());
  await assertSucceeds(deleteDoc(doc(founder(), path)));
  await ageThrottle(); await post(user());
  await setDoc(doc(founder(), 'admins/mod@example.com'), {email:'mod@example.com',createdAt:serverTimestamp()});
  await assertSucceeds(deleteDoc(doc(user('mod', {email:'mod@example.com',email_verified:true}), path)));
  await ageThrottle(); await post(user());
  await deleteDoc(doc(founder(), 'announcements/a'));
  await assertFails(getDocs(collection(user(), 'announcements/a/comments')));
});
async function seed() { await assertSucceeds(setDoc(doc(user(), 'tickets/t1'), ticket())); }
const ban = (extra = {}) => ({ reason: 'Spam répété', expiresAt: null, createdAt: serverTimestamp(), createdBy: 'founder', ...extra });
test('network bans stop new accounts and forged, missing or replayed permits', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  await assertFails(rawSetDoc(doc(user(), 'tickets/direct'), ticket()));
  const p=await grant('alice','ticket','one');
  const sender=user();
  const send=(id,permit=p)=>{
    const batch=writeBatch(sender); batch.set(doc(sender,'tickets',id),{...ticket(),networkPermit:permit});
    batch.update(doc(sender,'writePermits',permit),{usedAt:serverTimestamp()}); return batch.commit();
  };
  await assertFails(send('wrong'));
  await assertSucceeds(send('one'));
  await assertFails(send('one'));
  await assertFails(rawSetDoc(doc(user(),'writePermits','fake'),{uid:'alice'}));
  await env.withSecurityRulesDisabled(ctx=>rawSetDoc(doc(ctx.firestore(),'networkBans/test-ip'),{reason:'Spam',expiresAt:null}));
  await assertFails(post(user('new-account'),'new',{authorId:'new-account'},'new-account'));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'announcements/a')));
  await assertFails(getDoc(doc(user(),'networkUsers/alice')));
  await assertFails(getDoc(doc(user(),'networkBans/test-ip')));
  await assertFails(deleteDoc(doc(user(),'networkBans/test-ip')));
  await env.withSecurityRulesDisabled(ctx=>rawSetDoc(doc(ctx.firestore(),'networkBans/test-ip'),{reason:'Spam',expiresAt:new Date(Date.now()-60000)}));
  await assertSucceeds(post(user('new-account'),'new',{authorId:'new-account'},'new-account'));
});
test('bans block comments, new tickets and ticket messages while preserving reads', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement); await seed();
  await assertSucceeds(setDoc(doc(founder(), 'bans/alice'), ban()));
  await assertSucceeds(getDoc(doc(user(), 'bans/alice')));
  await assertSucceeds(getDoc(doc(user(), 'announcements/a')));
  await assertSucceeds(getDoc(doc(user(), 'tickets/t1')));
  await assertFails(post(user()));
  await assertFails(setDoc(doc(user(), 'tickets/new'), ticket()));
  await assertFails(setDoc(doc(user(), 'tickets/t1/messages/m'), message()));
  await assertFails(updateDoc(doc(user(), 'tickets/t1'), { updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(founder(), 'bans/alice')));
  await assertSucceeds(post(user()));
  await assertSucceeds(setDoc(doc(user(), 'tickets/new'), ticket()));
});
test('temporary bans expire and active bans block writes', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  await assertSucceeds(setDoc(doc(founder(), 'bans/alice'), ban({ expiresAt: new Date(Date.now() + 60000) })));
  await assertFails(post(user()));
  await env.withSecurityRulesDisabled(async ctx => setDoc(doc(ctx.firestore(), 'bans/alice'), ban({ expiresAt: new Date(Date.now() - 60000) })));
  await assertSucceeds(post(user()));
});
test('only moderators manage bans and users cannot read another ban or unban themselves', async () => {
  await assertFails(setDoc(doc(user(), 'bans/bob'), ban({createdBy:'alice'})));
  await assertFails(setDoc(doc(founder(), 'bans/founder'), ban()));
  await assertFails(setDoc(doc(founder(), 'bans/alice'), ban({expiresAt:new Date(0)})));
  await assertFails(setDoc(doc(founder(), 'bans/alice'), ban({createdBy:'someone'})));
  await assertFails(setDoc(doc(founder(), 'bans/alice'), ban({reason:''})));
  await setDoc(doc(founder(), 'bans/alice'), ban());
  await assertFails(getDoc(doc(user('bob'), 'bans/alice')));
  await assertFails(deleteDoc(doc(user(), 'bans/alice')));
  await assertFails(getDocs(collection(user(), 'bans')));
  await setDoc(doc(founder(), 'admins/mod@example.com'), {email:'mod@example.com',createdAt:serverTimestamp()});
  const mod = user('mod', {email:'mod@example.com',email_verified:true});
  await assertSucceeds(setDoc(doc(mod, 'bans/bob'), ban({createdBy:'mod'})));
  await setDoc(doc(founder(), 'bans/mod'), ban());
  await assertFails(deleteDoc(doc(mod, 'bans/bob')));
});
test('private tickets deny anonymous users and other members, including collection queries', async () => {
  await seed();
  await assertSucceeds(getDoc(doc(user(), 'tickets/t1')));
  await assertFails(getDoc(doc(user('bob'), 'tickets/t1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'tickets/t1')));
  await assertFails(getDocs(collection(user('bob'), 'tickets')));
  await assertSucceeds(getDocs(query(collection(user(), 'tickets'), where('creatorId', '==', 'alice'))));
});
test('unverified founder and administrator emails never grant privileges', async () => {
  await assertFails(setDoc(doc(founder(false), 'announcements/a'), announcement));
  await assertFails(setDoc(doc(founder(false), 'admins/bob@example.com'), { email: 'bob@example.com', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(founder(), 'admins/bob@example.com'), { email: 'bob@example.com', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(user('bob', { email: 'bob@example.com', email_verified: false }), 'announcements/a'), announcement));
  await assertFails(setDoc(doc(user('bob', { email: 'bob@example.com', email_verified: true }), 'announcements/a'), announcement));
  await assertFails(setDoc(doc(user('bob'), 'admins/bob'), { email: 'bob', createdAt: serverTimestamp() }));
});
test('ticket creation rejects forged ownership, unexpected fields, invalid sizes and timestamps', async () => {
  for (const extra of [{ creatorId: 'bob' }, { id: 'other' }, { creatorEmail: 'victim@example.com' }, { subject: 'x'.repeat(81) }, { category: 'invalid' }, { createdAt: new Date(0) }, { status: 'closed' }]) {
    await assertFails(setDoc(doc(user(), 'tickets/invalid'), ticket(extra)));
  }
  await seed();
  await assertFails(updateDoc(doc(user(), 'tickets/t1'), { creatorId: 'bob', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(founder(), 'tickets/t1'), { creatorId: 'bob', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(user(), 'tickets/t1'), { updatedAt: serverTimestamp() }));
});
test('messages protect privacy and reject impersonation, edits and closed-ticket writes', async () => {
  await seed();
  await assertSucceeds(setDoc(doc(user(), 'tickets/t1/messages/m1'), message()));
  await assertFails(getDoc(doc(user('bob'), 'tickets/t1/messages/m1')));
  await assertFails(setDoc(doc(user('bob'), 'tickets/t1/messages/m2'), message({ authorId: 'bob' })));
  for (const extra of [{ authorId: 'bob' }, { authorIsModerator: true }, { text: '' }, { text: 'x'.repeat(801) }, { createdAt: new Date(0) }, { injected: true }]) {
    await assertFails(setDoc(doc(user(), 'tickets/t1/messages/invalid'), message(extra)));
  }
  await assertFails(updateDoc(doc(user(), 'tickets/t1/messages/m1'), { text: 'edited' }));
  await assertSucceeds(setDoc(doc(founder(), 'tickets/t1/messages/mod'), message({ authorId: 'founder', authorIsModerator: true })));
  await assertSucceeds(updateDoc(doc(founder(), 'tickets/t1'), { status: 'closed', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(user(), 'tickets/t1/messages/closed'), message()));
});
test('announcements are public but writable only by the founder', async () => {
  await assertFails(setDoc(doc(user(), 'announcements/a'), announcement));
  await assertSucceeds(setDoc(doc(founder(), 'announcements/a'), announcement));
  await assertSucceeds(setDoc(doc(founder(), 'admins/admin@example.com'), { email: 'admin@example.com', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(user('admin', { email: 'admin@example.com', email_verified: true }), 'announcements/b'), announcement));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'announcements/a')));
  await assertFails(setDoc(doc(founder(), 'announcements/b'), { ...announcement, text: 'x'.repeat(321) }));
});

test('public profiles protect ownership, private fields and moderated content', async () => {
  const profile = {displayName:'Alice', bio:'Fan de 3DS', photoURL:'https://i.ibb.co/example/avatar.png', updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(user(),'profiles/alice'), profile));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'profiles/alice')));
  await assertFails(setDoc(doc(user('bob'),'profiles/alice'), profile));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,email:'private@example.com'}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,role:'admin'}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,photoURL:'https://evil.example/avatar.png'}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,bio:'www.spam.fr'}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,displayName:'connard'}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,bio:'a'.repeat(281)}));
  await env.withSecurityRulesDisabled(ctx => rawSetDoc(doc(ctx.firestore(),'bans/alice'),{expiresAt:null}));
  await assertFails(setDoc(doc(user(),'profiles/alice'), {...profile,bio:'Nouveau texte'}));
});
