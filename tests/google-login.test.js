import test from "node:test";
import assert from "node:assert/strict";
import { setupGoogleLogin } from "../google-login.js";

function fixture(login) {
  let click;
  const button = { disabled: false, textContent: "Continuer avec Google", addEventListener: (_, handler) => { click = handler; } };
  const status = { textContent: "" };
  const auth = {};
  const provider = { setCustomParameters: (params) => assert.deepEqual(params, { prompt: "select_account" }) };
  setupGoogleLogin({ auth, provider, button, status, signInWithPopup: login });
  return { button, status, auth, provider, click: () => click() };
}

test("opens Google immediately on click and keeps Firebase's session on the current page", async () => {
  let complete;
  let calls = 0;
  const f = fixture((auth, provider) => {
    calls++;
    assert.equal(auth, f.auth);
    assert.equal(provider, f.provider);
    return new Promise(resolve => { complete = () => { auth.currentUser = { uid: "member" }; resolve(); }; });
  });
  const result = f.click();
  assert.equal(calls, 1);
  assert.equal(f.button.disabled, true);
  await f.click();
  assert.equal(calls, 1);
  complete();
  await result;
  assert.equal(f.auth.currentUser.uid, "member");
  assert.equal(f.status.textContent, "Connexion réussie.");
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.textContent, "Continuer avec Google");
});

for (const [code, message] of [["auth/popup-blocked", /Autorise les fenêtres/], ["auth/popup-closed-by-user", /fermée/], ["auth/network-request-failed", /réseau/]]) {
  test(`${code} explains the problem and permits another attempt`, async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; throw { code }; });
    await f.click();
    assert.match(f.status.textContent, message);
    assert.equal(f.button.disabled, false);
    await f.click();
    assert.equal(calls, 2);
  });
}

test("does not overwrite an access-denied message from the auth observer", async () => {
  const f = fixture(async () => { f.status.textContent = "Ce compte n’est pas autorisé."; });
  await f.click();
  assert.equal(f.status.textContent, "Ce compte n’est pas autorisé.");
});
