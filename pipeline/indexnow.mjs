// pipeline/indexnow.mjs
// IndexNow 자동 통지 — 빌드가 끝나면 새/바뀐 주소를 검색엔진(네이버·Bing·Yandex 등)에 알린다.
//
// 키는 공개 키다(비밀 아님). 사이트 루트에 <key>.txt 파일로 그대로 서빙되어
// "이 사이트의 주인"임을 증명하는 용도로만 쓰인다. 값이 바뀌면 파일 이름도 바뀌므로
// 배포 후 새 URL이 200으로 열린 뒤에 통지해야 한다(빌드에서 같은 실행 중에 파일을 쓰고 보낸다).
//
// 전송 실패·타임아웃은 빌드를 깨뜨리지 않는다: pingIndexNow()는 절대 throw 하지 않는다.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export const INDEXNOW_KEY = 'dc17006f1d82386eef1d24c63548eb49';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_TIMEOUT_MS = 5000;
export const INDEXNOW_MAX_URLS = 10000;

export const keyFileName = (key = INDEXNOW_KEY) => `${key}.txt`;

/** 키 파일을 public/ 에 쓴다 → https://<host>/<key>.txt 로 서빙된다. */
export async function writeKeyFile(outDir, { key = INDEXNOW_KEY, fsImpl = fs } = {}) {
  await fsImpl.writeFile(`${outDir}/${keyFileName(key)}`, key, 'utf8');
  return keyFileName(key);
}

export function buildIndexNowPayload({ site, urls = [], key = INDEXNOW_KEY }) {
  const origin = new URL(site);
  const urlList = [...new Set(urls.filter(Boolean))].slice(0, INDEXNOW_MAX_URLS);
  return {
    host: origin.host,
    key,
    keyLocation: `${origin.origin}/${keyFileName(key)}`,
    urlList,
  };
}

/**
 * 프로덕션 빌드에서만 실제로 보낸다.
 * - 로컬 빌드/테스트: CF_PAGES 가 없으므로 보내지 않는다.
 * - SKIP_INDEXNOW=1 또는 INDEXNOW_DRY_RUN=1: 강제로 끈다.
 * - Cloudflare Pages 프리뷰 배포(브랜치가 main 이 아님): 보내지 않는다.
 */
export function shouldPingIndexNow(env = process.env) {
  if (env.SKIP_INDEXNOW === '1' || env.INDEXNOW_DRY_RUN === '1') return false;
  if (env.CF_PAGES !== '1') return false;
  const branch = env.CF_PAGES_BRANCH;
  if (branch && branch !== 'main') return false;
  return true;
}

/**
 * IndexNow 로 URL 목록을 보낸다. 어떤 경우에도 throw 하지 않고 결과만 돌려준다.
 * @returns {Promise<{ok:boolean, status?:number, skipped?:boolean, reason?:string, error?:string}>}
 */
export async function pingIndexNow({
  site,
  urls,
  key = INDEXNOW_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = INDEXNOW_TIMEOUT_MS,
  log = () => {},
} = {}) {
  let payload;
  try {
    payload = buildIndexNowPayload({ site, urls, key });
  } catch (e) {
    log(`[indexnow] 건너뜀 — 주소 형식 오류: ${e?.message || e}`);
    return { ok: false, skipped: true, reason: 'bad-site' };
  }

  if (!payload.urlList.length) {
    log('[indexnow] 건너뜀 — 보낼 URL 없음');
    return { ok: false, skipped: true, reason: 'no-urls' };
  }
  if (typeof fetchImpl !== 'function') {
    log('[indexnow] 건너뜀 — fetch 없음');
    return { ok: false, skipped: true, reason: 'no-fetch' };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const status = Number(res?.status) || 0;
    const ok = status === 200 || status === 202;
    log(
      `[indexnow] ${ok ? 'OK' : 'FAIL'} ${status} · ${payload.urlList.length}개 URL` +
        (ok ? '' : ` (200/202 아님 — 키 파일·host 확인 필요)`)
    );
    return { ok, status };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    log(`[indexnow] 전송 실패(빌드는 계속) — ${aborted ? `${timeoutMs}ms 타임아웃` : e?.message || e}`);
    return { ok: false, error: aborted ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 키 값 자체가 IndexNow 규격(8~128자 영숫자·하이픈)에 맞는지 */
export function isValidIndexNowKey(key = INDEXNOW_KEY) {
  return typeof key === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(key);
}

/** 새 키가 필요할 때: 32자리 hex */
export const generateIndexNowKey = () => crypto.randomBytes(16).toString('hex');
