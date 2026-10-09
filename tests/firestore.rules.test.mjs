import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
test('comments are public on real announcements and authenticated members can post', async () => {
  await assertSucceeds(setDoc(doc(founder(), 'announcements/a'), announcement));
  await assertSucceeds(setDoc(doc(user(), 'announcements/a/comments/c'), comment()));
  await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'announcements/a/comments')));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'announcements/a/comments/anon'), comment()));
  await assertFails(setDoc(doc(user(), 'announcements/missing/comments/c'), comment()));
  await assertSucceeds(setDoc(doc(user('bob', { name: 'Bob' }), 'announcements/a/comments/bob'), comment({ authorId: 'bob', authorName: 'Bob', text: 'Bonjour\nà tous !' })));
  await assertSucceeds(setDoc(doc(user('discord', { discordName: 'Discord member' }), 'announcements/a/comments/discord'), comment({ authorId: 'discord', authorName: 'Discord member' })));
});
test('comments reject forged authors, empty text, oversized messages, timestamps and edits', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  for (const extra of [{ authorId: 'bob' }, { authorName: 'Fondateur' }, { text: '' }, { text: '  \n ' }, { text: 'x'.repeat(801) }, { createdAt: new Date(0) }, { admin: true }]) {
    await assertFails(setDoc(doc(user(), 'announcements/a/comments/c'), comment(extra)));
  }
  await setDoc(doc(user(), 'announcements/a/comments/c'), comment());
  await assertFails(updateDoc(doc(user(), 'announcements/a/comments/c'), { text: 'Modifié' }));
});
test('only the author or moderators can delete comments; deleted announcements hide comments', async () => {
  await setDoc(doc(founder(), 'announcements/a'), announcement);
  const path = 'announcements/a/comments/c';
  await setDoc(doc(user(), path), comment());
  await assertFails(deleteDoc(doc(user('bob'), path)));
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), path)));
  await assertSucceeds(deleteDoc(doc(user(), path)));
  await setDoc(doc(user(), path), comment());
  await assertSucceeds(deleteDoc(doc(founder(), path)));
  await setDoc(doc(user(), path), comment());
  await setDoc(doc(founder(), 'admins/mod@example.com'), { email: 'mod@example.com', createdAt: serverTimestamp() });
  await assertSucceeds(deleteDoc(doc(user('mod', { email: 'mod@example.com', email_verified: true }), path)));
  await setDoc(doc(user(), path), comment());
  await deleteDoc(doc(founder(), 'announcements/a'));
  await assertFails(getDocs(collection(user(), 'announcements/a/comments')));
});
async function seed() { await assertSucceeds(setDoc(doc(user(), 'tickets/t1'), ticket())); }
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
