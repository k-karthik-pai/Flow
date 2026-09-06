import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate } from '../utils/date.js';

const events = {};
const local = {};
const session = {};
const alarms = {};
let rules = [];
let currentTab = { id: 1, url: 'https://example.com/', title: 'Example' };
const redirects = [];
const event = name => ({ addListener: fn => { events[name] = fn; } });
function storage(data) {
  return {
    get: async (keys, callback) => { const result = structuredClone(Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))); callback?.(result); return result; },
    set: async (values, callback) => { Object.assign(data, structuredClone(values)); callback?.(); },
    setAccessLevel: async () => {}
  };
}
globalThis.chrome = {
  runtime: { id: 'test', getURL: p => `chrome-extension://test/${p.replace(/^\//, '')}`, onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message') },
  storage: { local: storage(local), session: storage(session) },
  alarms: { onAlarm: event('alarm'), create: async (name, config) => { alarms[name] = config; }, clear: async name => { delete alarms[name]; } },
  tabs: { onUpdated: event('tab'), get: async () => currentTab, update: async (id, update) => { redirects.push(update.url); }, create: async () => {} },
  declarativeNetRequest: { getDynamicRules: async () => rules, updateDynamicRules: async update => { rules = update.addRules; } }
};
await import('../background.js');
const message = (msg, url = 'chrome-extension://test/popup/popup.html') => new Promise(resolve => events.message(msg, { id: 'test', url }, resolve));
const settle = () => new Promise(resolve => setImmediate(resolve));

test('updates preserve disabled blocking and startup restores pause alarms', async () => {
  local.blockingEnabled = false;
  await events.install();
  assert.equal(local.blockingEnabled, false);
  assert.equal(rules.length, 0);
  local.pauseUntil = Date.now() + 600000;
  await events.startup();
  assert.equal(alarms.pauseEnd.when, local.pauseUntil);
});

test('clearing a goal stores null and removes AI rules', async () => {
  local.aiBlocklist = [{ domain: 'example.com', reason: 'old' }];
  assert.equal((await message({ type: 'SET_GOAL', goal: null })).success, true);
  assert.equal(local.goal, null);
  assert.deepEqual(local.aiBlocklist, []);
});

test('web content cannot change settings or request private state', async () => {
  assert.match((await message({ type: 'SET_GOAL', goal: 'Injected' }, 'https://example.com/')).error, /not allowed/);
  assert.match((await message({ type: 'GET_STATE' }, 'https://example.com/')).error, /not allowed/);
  assert.equal((await message({ type: 'CHECK_BLOCKED' }, 'https://example.com/')).error, undefined);
});

test('delayed AI does not redirect a tab that navigated elsewhere', async () => {
  Object.assign(local, { blockingEnabled: true, pauseUntil: null, apiKey: 'AIza-test', goal: { text: 'Study', revision: 'one', date: localDate() }, manualBlocklist: [], aiBlocklist: [], whitelist: [] });
  session.evaluatedDomains = {};
  let resolveFetch;
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  events.tab(1, { status: 'complete' }, { ...currentTab });
  await settle();
  assert.ok(resolveFetch);
  currentTab = { ...currentTab, url: 'https://work.example.org/' };
  resolveFetch({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"distracting":true}' }] } }] }) });
  await settle();
  assert.deepEqual(redirects, []);
});

test('late goal analysis cannot repopulate a cleared goal blocklist', async () => {
  let resolveFetch;
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  await message({ type: 'SET_GOAL', goal: 'Study physics' });
  await settle();
  assert.ok(resolveFetch);
  await message({ type: 'SET_GOAL', goal: null });
  resolveFetch({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"blocked":[{"domain":"example.com","reason":"old"}]}' }] } }] }) });
  await settle();
  assert.deepEqual(local.aiBlocklist, []);
});

test('midnight reset clears daily state and schedules the next local midnight', async () => {
  local.dailyResetDate = '2000-01-01';
  session.sessionAllowed = ['example.com'];
  await events.alarm({ name: 'midnightReset' });
  assert.equal(local.dailyResetDate, localDate());
  assert.deepEqual(session.sessionAllowed, []);
  assert.equal(local.goal, null);
  assert.ok(alarms.midnightReset.delayInMinutes > 0);
  assert.equal(alarms.midnightReset.periodInMinutes, undefined);
});
