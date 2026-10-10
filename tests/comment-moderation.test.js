import test from 'node:test';
import assert from 'node:assert/strict';
import { commentModerationError } from '../comment-moderation.js';
test('moderation accepts normal French conversations and multiline messages', () => {
  for (const text of ['Super projet, merci !', 'Salut\nQui joue ce soir ?', 'Une discussion sur les ordinateurs et les députés.', 'Le concurrent propose aussi des thèmes.']) assert.equal(commentModerationError(text), '');
});
test('moderation rejects listed insults regardless of case, punctuation or lines', () => {
  for (const text of ['CONNARD !', 'Salut\nfdp', 'Tu es une salope.', 'ntm']) assert.match(commentModerationError(text), /insultes/);
});
test('moderation blocks explicit web and invitation links and invalid lengths', () => {
  for (const text of ['https://example.org', 'Va sur WWW.example.org', 'discord.gg/test', 'discord.com/invite/test']) assert.match(commentModerationError(text), /liens/);
  assert.notEqual(commentModerationError(' \n '), '');
  assert.notEqual(commentModerationError('a'.repeat(801)), '');
});
