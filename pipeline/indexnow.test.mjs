// pipeline/indexnow.test.mjs — IndexNow 키·페이로드·전송 가드
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  buildIndexNowPayload,
  isValidIndexNowKey,
  keyFileName,
  pingIndexNow,
  shouldPingIndexNow,
  writeKeyFile,
} from './indexnow.mjs';

const SITE = 'https://color.uncledison.com';

test('키: 32자리 hex이고 IndexNow 규격에 맞는다', () => {
  assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
  assert.ok(isValidIndexNowKey(INDEXNOW_KEY));
  assert.equal(keyFileName(), `${INDEXNOW_KEY}.txt`);
});

test('페이로드: host는 프로토콜 없이, keyLocation은 사이트 루트', () => {
  const p = buildIndexNowPayload({ site: SITE, urls: [`${SITE}/`, `${SITE}/p/a`] });
  assert.equal(p.host, 'color.uncledison.com');
  assert.equal(p.key, INDEXNOW_KEY);
  assert.equal(p.keyLocation, `${SITE}/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(p.urlList, [`${SITE}/`, `${SITE}/p/a`]);
});

test('페이로드: 중복 URL은 한 번만, 10,000개까지만', () => {
  const urls = [`${SITE}/a`, `${SITE}/a`, ...Array.from({ length: 12000 }, (_, i) => `${SITE}/p/${i}`)];
  const p = buildIndexNowPayload({ site: SITE, urls });
  assert.equal(p.urlList.length, 10000);
  assert.equal(p.urlList.filter((u) => u === `${SITE}/a`).length, 1);
});

test('전송 여부: 로컬 빌드에서는 보내지 않는다', () => {
  assert.equal(shouldPingIndexNow({}), false);
  assert.equal(shouldPingIndexNow({ CF_PAGES: '0' }), false);
});

test('전송 여부: Cloudflare Pages 프로덕션 빌드(main)에서만 보낸다', () => {
  assert.equal(shouldPingIndexNow({ CF_PAGES: '1' }), true);
  assert.equal(shouldPingIndexNow({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }), true);
  assert.equal(shouldPingIndexNow({ CF_PAGES: '1', CF_PAGES_BRANCH: 'feat/seo' }), false);
});

test('전송 여부: SKIP_INDEXNOW / INDEXNOW_DRY_RUN 으로 끌 수 있다', () => {
  assert.equal(shouldPingIndexNow({ CF_PAGES: '1', SKIP_INDEXNOW: '1' }), false);
  assert.equal(shouldPingIndexNow({ CF_PAGES: '1', INDEXNOW_DRY_RUN: '1' }), false);
});

test('전송: 200/202면 성공으로 기록한다', async () => {
  const calls = [];
  const res = await pingIndexNow({
    site: SITE,
    urls: [`${SITE}/p/a`],
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { status: 202 };
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.status, 202);
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.host, 'color.uncledison.com');
  assert.deepEqual(body.urlList, [`${SITE}/p/a`]);
});

test('전송: 403 같은 실패 응답은 ok:false 로만 남고 던지지 않는다', async () => {
  const res = await pingIndexNow({
    site: SITE,
    urls: [`${SITE}/p/a`],
    fetchImpl: async () => ({ status: 403 }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
});

test('전송: 네트워크 오류는 빌드를 깨뜨리지 않는다', async () => {
  const res = await pingIndexNow({
    site: SITE,
    urls: [`${SITE}/p/a`],
    fetchImpl: async () => {
      throw new Error('ENOTFOUND api.indexnow.org');
    },
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /ENOTFOUND/);
});

test('전송: 응답이 없으면 5초(테스트는 50ms) 타임아웃으로 끝난다', async () => {
  const started = Date.now();
  const res = await pingIndexNow({
    site: SITE,
    urls: [`${SITE}/p/a`],
    timeoutMs: 50,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'timeout');
  assert.ok(Date.now() - started < 2000);
});

test('전송: 보낼 URL이 없으면 건너뛴다', async () => {
  const res = await pingIndexNow({ site: SITE, urls: [], fetchImpl: async () => ({ status: 200 }) });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'no-urls');
});

test('키 파일: public/<key>.txt 에 키 문자열 그대로 쓴다', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indexnow-'));
  const name = await writeKeyFile(dir);
  assert.equal(name, `${INDEXNOW_KEY}.txt`);
  const body = await fs.readFile(path.join(dir, name), 'utf8');
  assert.equal(body, INDEXNOW_KEY);
});
