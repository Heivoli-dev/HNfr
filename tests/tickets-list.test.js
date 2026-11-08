import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../tickets.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function renderTickets('), source.indexOf('setupGoogleLogin('));
function fixture(moderator = false) {
  const list = { children: [], replaceChildren() { this.children = []; }, append(item) { this.children.push(item); } };
  let subscribed, errorHandler;
  const context = vm.createContext({
    ticketList: list, isModerator: moderator, currentUser: { uid: 'alice' }, selectedTicket: { id: 'older' }, stopTickets: null, db: {},
    setSelectedTicket: ticket => { context.selectedTicket = ticket; },
    document: { createElement: tag => ({ tag, children: [], append(...items) { this.children.push(...items); }, addEventListener() {} }) },
    collection: (...args) => args.slice(1).join('/'), where: (...args) => ({ where: args }), orderBy: (...args) => ({ orderBy: args }),
    query: (...parts) => parts,
    onSnapshot: (query, render, error) => { subscribed = { query, render }; errorHandler = error; return () => {}; }
  });
  vm.runInContext(functions + '\nlistenToTickets();', context);
  return { context, list, subscription: () => subscribed, error: value => errorHandler(value) };
}
test('member ticket list only queries the current owner and sorts updates locally', () => {
  const f = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(f.subscription().query)), ['tickets', { where: ['creatorId', '==', 'alice'] }]);
  f.subscription().render({ empty: false, docs: [
    { id: 'older', data: () => ({ subject: 'Ancien', updatedAt: { toMillis: () => 1 } }) },
    { id: 'newer', data: () => ({ subject: 'Récent', updatedAt: { toMillis: () => 2 } }) }
  ] });
  assert.deepEqual(f.list.children.map(button => button.children[0].textContent), ['Récent', 'Ancien']);
  assert.match(f.list.children[1].className, /is-selected/);
  assert.equal(f.context.selectedTicket.id, 'older');
});
test('ticket list distinguishes service failures from access refusal', () => {
  const f = fixture();
  f.error({ code: 'unavailable' }); assert.match(f.list.textContent, /connexion Internet/);
  f.error({ code: 'permission-denied' }); assert.match(f.list.textContent, /compte n’a pas accès/);
  f.error({ code: 'failed-precondition' }); assert.match(f.list.textContent, /configuration/);
});
