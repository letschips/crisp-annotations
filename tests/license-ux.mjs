// Run with: node --test tests/license-ux.mjs
// Real verifier and Ed25519 (test key swapped into an isolated VM); only the Obsidian transport is simulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { Buffer, atob, btoa } from 'node:buffer';
import { TextEncoder, TextDecoder } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
const FULLWIDTH = String.fromCharCode(0x3000);
const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);
const loadNode = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pair = generateKeyPairSync('ed25519');
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const foreign = generateKeyPairSync('ed25519');

function makeCode(overrides = {}, key = pair.privateKey) {
  const payload = Buffer.from(JSON.stringify({ product: 'Crisp Suite', licenseId: 'LOCAL-UX-TEST', userName: 'tester',
    features: ['all'], expiresAt: '2999-01-01T00:00:00Z', ...overrides })).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), key).toString('base64url')}`;
}

function load(denied = new Set()) {
  const requests = [];
  const requestUrl = async (options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const ok = !denied.has(body.licenseCode);
    return { status: 200, json: ok ? { valid: true } : { valid: false, reason: 'revoked' } };
  };
  const module = { exports: {} };
  class EmptyBase {}
  const context = {
    module, exports: module.exports, atob, btoa, TextEncoder, TextDecoder, Buffer, crypto: webcrypto,
    console: { debug() {}, log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    require(id) {
      if (id !== 'obsidian') return loadNode(id);
      return new Proxy({ requestUrl }, { get(target, key) { return target[key] ?? EmptyBase; } });
    },
  };
  context.window = context;
  let source = fs.readFileSync(path.join(root, 'src', 'license.ts'), 'utf8');
  assert.match(source, /-----BEGIN PUBLIC KEY-----/);
  source = source.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/, publicPem.trim());
  const ts = loadNode('typescript');
  source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, context, { filename: 'license-under-test.js' });
  return { api: module.exports, requests };
}

function fakeApp(files, loaded = {}) {
  return {
    vault: {
      configDir: '.cfg',
      adapter: {
        async exists(p) { return p in files; },
        async read(p) { return files[p]; },
      },
    },
    plugins: { plugins: loaded },
  };
}

const id = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).id;
const verify = (api, code) => api.verifyLicenseCode(code, id);

test('normalize: broken pastes verify like the clean code and the server sees the clean code', async () => {
  const clean = makeCode();
  const mid = Math.floor(clean.length / 2);
  const variants = [
    `${clean.slice(0, mid)}\n${clean.slice(mid)}`,
    `${clean.slice(0, mid)}\r\n${clean.slice(mid)}`,
    `${clean.slice(0, 20)} ${clean.slice(20)}`,
    `${clean.slice(0, 20)}${FULLWIDTH}${clean.slice(20)}`,
    `${clean.slice(0, 20)}${NBSP}${clean.slice(20)}`,
    `${clean.slice(0, 20)}${ZWSP}${clean.slice(20)}`,
    `卡密：${clean}。`,
    `${clean}\n复制卡密发送给买家`,
  ];
  for (const variant of variants) {
    const { api, requests } = load();
    const result = await verify(api, variant);
    assert.equal(result.valid, true, JSON.stringify(variant.slice(0, 30)));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].licenseCode, clean);
  }
});

test('normalize: clean code unchanged, junk and empty stay invalid with the same reasons', async () => {
  const { api } = load();
  const clean = makeCode();
  assert.equal(api.normalizeLicenseCode(clean), clean);
  assert.equal(api.normalizeLicenseCode(undefined), '');
  assert.equal((await verify(api, '')).valid, false);
  assert.equal((await verify(api, '   \n ')).valid, false);
  assert.equal((await verify(api, 'hello world')).valid, false);
  assert.match((await verify(api, 'hello world')).reason, /格式无效/);
  assert.equal((await verify(api, makeCode({}, foreign.privateKey))).valid, false);
});

test('inherit: no own code, sibling holds a valid code -> accepted', async () => {
  const { api, requests } = load();
  const code = makeCode();
  const app = fakeApp({ '.cfg/plugins/crisp-tempo/data.json': JSON.stringify({ licenseKey: `卡密：${code}。` }) });
  let own = '';
  const accepted = [];
  const ok = await api.inheritSiblingLicense(app, {
    targetPluginId: id, currentCode: () => own, aborted: () => false,
    accept: async (c) => { own = c; accepted.push(c); },
  });
  assert.equal(ok, true);
  assert.deepEqual(accepted, [code]);
  assert.equal(requests.at(-1).licenseCode, code);
});

test('inherit: loaded sibling settings are read too, own plugin id is skipped', async () => {
  const { api } = load();
  const code = makeCode();
  const app = fakeApp({}, { [id]: { settings: { licenseCode: makeCode({ licenseId: 'SELF' }) } }, 'crisp-pulse': { settings: { licenseCode: code } } });
  const found = await api.discoverVaultCrispLicenses(app, id);
  assert.deepEqual([...found], [code]);
});

// Crisp Pulse keeps its code under `settings`; Pets and Days keep theirs under `options`.
test("inherit: Pulse's nested settings on disk and a loaded sibling's options are read", async () => {
  const { api } = load();
  const a = makeCode({ licenseId: 'PULSE' });
  const b = makeCode({ licenseId: 'TEST-B' });
  const loaded = {};
  const app = fakeApp({ '.cfg/plugins/crisp-pulse/data.json': JSON.stringify({ settings: { licenseCode: a } }) }, loaded);
  assert.deepEqual([...(await api.discoverVaultCrispLicenses(app, id))], [a]);
  loaded['crisp-focus'] = { options: { licenseCode: b } };
  assert.deepEqual([...(await api.discoverVaultCrispLicenses(app, id))], [b, a]);
});

test('inherit: sibling code denied online -> nothing accepted', async () => {
  const code = makeCode();
  const { api } = load(new Set([code]));
  const app = fakeApp({ '.cfg/plugins/crisp-pulse/data.json': JSON.stringify({ licenseCode: code }) });
  const accepted = [];
  const ok = await api.inheritSiblingLicense(app, {
    targetPluginId: id, currentCode: () => '', aborted: () => false, accept: async (c) => { accepted.push(c); },
  });
  assert.equal(ok, false);
  assert.deepEqual(accepted, []);
});

test('inherit: forged or single-product code never reaches the network', async () => {
  const { api, requests } = load();
  const forged = makeCode({}, foreign.privateKey);
  const other = makeCode({ features: ['crisp-somethingelse'], product: 'Crisp Focus' });
  const app = fakeApp({
    '.cfg/plugins/crisp-pulse/data.json': JSON.stringify({ licenseCode: forged }),
    '.cfg/plugins/crisp-tempo/data.json': JSON.stringify({ licenseKey: other }),
  });
  const ok = await api.inheritSiblingLicense(app, {
    targetPluginId: id, currentCode: () => '', aborted: () => false, accept: async () => {},
  });
  assert.equal(ok, false);
  assert.equal(requests.length, 0);
});

test('inherit: stops when unloaded or the own code changed meanwhile', async () => {
  const { api } = load();
  const code = makeCode();
  const app = fakeApp({ '.cfg/plugins/crisp-pulse/data.json': JSON.stringify({ licenseCode: code }) });
  let accepted = 0;
  assert.equal(await api.inheritSiblingLicense(app, {
    targetPluginId: id, currentCode: () => '', aborted: () => true, accept: async () => { accepted++; },
  }), false);
  let own = '';
  assert.equal(await api.inheritSiblingLicense(app, {
    targetPluginId: id, currentCode: () => own, aborted: () => { own = 'typed'; return false; }, accept: async () => { accepted++; },
  }), false);
  assert.equal(accepted, 0);
});
