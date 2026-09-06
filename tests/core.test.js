import test from 'node:test';
import assert from 'node:assert/strict';
import '../utils/domains.js';
import { localDate } from '../utils/date.js';
import { updateAllRules } from '../utils/rules.js';
import { judgeAppeal, analyzeGoal, evaluateDomainDynamically } from '../utils/ai.js';

test('domains match exact hosts and subdomains without crossing TLDs or host boundaries', () => {
  const { normalizeDomain, matchesDomain } = FlowDomains;
  assert.equal(normalizeDomain('https://www.Example.com:8080/path?q=1'), 'example.com');
  for (const value of ['foo bar', '*.com', 'https://user:pass@example.com', '<script>', 'https://']) assert.equal(normalizeDomain(value), null);
  for (const host of ['example.com', 'a.example.com']) assert.equal(matchesDomain(host, 'example.com'), true);
  for (const host of ['notexample.com', 'example.com.evil.test', 'example.org', 'example.co.in']) assert.equal(matchesDomain(host, 'example.com'), false);
  assert.equal(matchesDomain('localhost', 'localhost'), true);
});

test('local calendar date is used rather than UTC', () => {
  const date = new Date(2026, 8, 6, 0, 1);
  assert.equal(localDate(date), '2026-09-06');
});

test('DNR matches multi-part domains, ports and subdomains; allow rules override blocks', async () => {
  let rules;
  globalThis.chrome = { runtime: { getURL: p => `chrome-extension://test${p}` }, declarativeNetRequest: {
    getDynamicRules: async () => [{ id: 42 }],
    updateDynamicRules: async update => { assert.deepEqual(update.removeRuleIds, [42]); rules = update.addRules; }
  }};
  await updateAllRules(['example.co.in'], [], ['work.example.co.in'], ['https://appeal.example.co.in/a']);
  const block = rules.find(r => r.action.type === 'redirect');
  const re = new RegExp(block.condition.regexFilter, 'i');
  assert.equal(re.test('https://a.example.co.in:8443/path?x=1&y=a+b'), true);
  assert.equal(re.test('https://example.com/'), false);
  assert.equal(re.test('https://example.co.in.evil.test/'), false);
  assert.ok(rules.filter(r => r.action.type === 'allow').every(r => r.priority > block.priority));
  await updateAllRules([], [], [], [], true);
  for (const host of ['localhost', '127.0.0.1', 'google.co.in']) {
    assert.ok(rules.some(r => r.action.type === 'allow' && new RegExp(r.condition.regexFilter).test(`http://${host}:8080/`)));
  }
});

test('AI response types are validated and URL secrets are excluded', async () => {
  const originalFetch = globalThis.fetch;
  let response = { allow: 'false' };
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }) };
  };
  try {
    await assert.rejects(judgeAppeal('AIza-test', 'Study', 'example.com', 'Research'), /Invalid AI appeal/);
    response = { allow: false, reasoning: 'Unrelated' };
    assert.equal((await judgeAppeal('AIza-test', 'Study', 'example.com', 'Research')).allow, false);
    response = { blocked: [{ domain: 'example.com', reason: 'Distraction' }, { domain: '*', reason: 'bad' }] };
    assert.deepEqual(await analyzeGoal('AIza-test', 'Study'), [{ domain: 'example.com', reason: 'Distraction' }]);
    response = { distracting: true };
    assert.equal(await evaluateDomainDynamically('AIza-test', 'Study', 'example.com', 'https://user:secret@example.com/path?token=SECRET#PRIVATE', 'Example'), true);
    assert.ok(!request.options.body.includes('SECRET'));
    assert.ok(!request.options.body.includes('PRIVATE'));
    assert.ok(!request.options.body.includes('user:secret'));
    assert.ok(!request.url.includes('AIza'));
    assert.equal(request.options.headers['x-goog-api-key'], 'AIza-test');
  } finally { globalThis.fetch = originalFetch; }
});
