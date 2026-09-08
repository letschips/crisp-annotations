// Run with: node --test tests/license-http.mjs
// Real verifier and Ed25519; only the Obsidian transport is simulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { Buffer, atob, btoa } from 'node:buffer';
import { TextEncoder, TextDecoder } from 'node:util';
import { setTimeout, clearTimeout } from 'node:timers';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const loadNode = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pluginId = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).id;
const pair = generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
function makeCode(overrides = {}) {
  const payload = Buffer.from(JSON.stringify({ product: 'Crisp Suite', licenseId: 'LOCAL-HTTP-TEST',
    features: ['all'], expiresAt: '2999-01-01T00:00:00Z', ...overrides })).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), pair.privateKey).toString('base64url')}`;
}
function loadVerifier(scenario) {
  const timers = new Set();
  let calls = 0;
  const requestUrl = async (options) => {
    calls++;
    if (scenario.network) throw new Error('network unavailable');
    if (scenario.timeout) return new Promise(() => {});
    // Obsidian RequestUrlParam: status >= 400 throws unless throw:false.
    if (scenario.status >= 400 && options.throw !== false) throw new Error(`Request failed, status ${scenario.status}`);
    return { status: scenario.status, get json() {
      if (scenario.malformed) throw new SyntaxError('Unexpected HTML response');
      return scenario.body;
    } };
  };
  const module = { exports: {} };
  class EmptyBase {}
  const context = {
    module, exports: module.exports, atob, btoa, TextEncoder, TextDecoder, Buffer,
    crypto: webcrypto, console: { debug() {}, log() {}, warn() {}, error() {} },
    setTimeout(fn, ms) {
      const timer = setTimeout(fn, ms === 2500 ? 10 : ms);
      timers.add(timer);
      return timer;
    }, clearTimeout,
    require(id) {
      if (id !== 'obsidian') return loadNode(id);
      return new Proxy({ requestUrl, addIcon() {}, debounce(fn) { return fn; } }, { get(target, key) { return target[key] ?? EmptyBase; } });
    },
  };
  context.window = context;
  const tsPath = path.join(root, 'src', 'license.ts');
  let source = fs.readFileSync(fs.existsSync(tsPath) ? tsPath : path.join(root, 'main.js'), 'utf8');
  // Replace only the public key in this isolated test VM. No production signing keys or real activation calls.
  assert.match(source, /-----BEGIN PUBLIC KEY-----/);
  source = source.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/, publicPem.trim());
  if (fs.existsSync(tsPath)) {
    const ts = loadNode('typescript');
    source = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
  }
  const functionName = pluginId === 'crisp-base' ? 'verifyLicense' : pluginId === 'crisp-recall' ? 'verifyCrispRecallLicense' : 'verifyLicenseCode';
  vm.runInNewContext(`${source}\nglobalThis.httpTestVerifier = ${functionName};`, context, { filename: 'license-under-test.js' });
  return {
    verify(code) {
      return pluginId === 'crisp-recall' ? context.httpTestVerifier(code, { online: true }) : context.httpTestVerifier(code, pluginId);
    },
    calls: () => calls,
    cleanup: () => { for (const timer of timers) clearTimeout(timer); },
  };
}
const cases = [
  { name: '200 success', status: 200, body: { valid: true }, valid: true },
  { name: '200 explicit denial', status: 200, body: { valid: false, reason: 'revoked' }, valid: false },
  { name: '400 malformed authorization', status: 400, body: { valid: false, reason: 'invalid' }, valid: false },
  { name: '401 explicit denial', status: 401, body: { valid: false, reason: 'invalid' }, valid: false },
  { name: '403 revoked with real throw default', status: 403, body: { valid: false, reason: 'revoked' }, valid: false },
  { name: '403 device limit with real throw default', status: 403, body: { valid: false, reason: 'device limit' }, valid: false },
  ...[404, 408, 429, 500, 502, 503, 504].map(status => ({ name: `${status} is unavailable, not revoked`, status, body: { valid: false, reason: 'service error' }, valid: true })),
  { name: '503 HTML response', status: 503, malformed: true, valid: true },
  { name: '403 gateway HTML is not an authorization denial', status: 403, malformed: true, valid: true },
  { name: '200 malformed JSON', status: 200, malformed: true, valid: true },
  { name: '200 missing decision', status: 200, body: {}, valid: true },
  { name: 'network failure', network: true, valid: true },
  ...(pluginId === 'crisp-graph' ? [] : [{ name: 'request timeout', timeout: true, valid: true }]),
];
for (const scenario of cases) {
  test(scenario.name, async () => {
    const verifier = loadVerifier(scenario);
    try {
      const result = await verifier.verify(makeCode());
      assert.equal(verifier.calls(), 1, 'must reach the real online verification branch');
      assert.equal(result.valid, scenario.valid);
      if (!scenario.valid) assert.equal(result.reason, scenario.body.reason);
    } finally { verifier.cleanup(); }
  });
}
for (const kind of ['expired', 'bad signature']) {
  test(`${kind} never becomes valid during outage`, async () => {
    const verifier = loadVerifier({ network: true });
    try {
      let code = makeCode(kind === 'expired' ? { expiresAt: '2020-01-01T00:00:00Z' } : {});
      if (kind === 'bad signature') code = `${code.split('.')[0]}.${Buffer.alloc(64).toString('base64url')}`;
      assert.equal((await verifier.verify(code)).valid, false);
      assert.equal(verifier.calls(), 0);
    } finally { verifier.cleanup(); }
  });
}
