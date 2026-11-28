// pipeline/cards.test.mjs — '카드·편지지' 대분류(크리스마스 카드 세트) 점검
//
// 지키려는 것
// 1) data/cards.json 은 Notion 빌드와 무관하게 레포에 고정된 세트를 담고 있고,
//    그 데이터가 가리키는 미리보기·인쇄 이미지·A4 PDF 파일이 실제로 저장소에 있다.
//    (노션 빌드가 다시 돌아도 카테고리와 세트가 사라지지 않는다)
// 2) /p/<id> 페이지는 4장 세트를 보여주고, 장별 인쇄 · 세트 PDF 받기 모두 3초 게이트를 거친다.
// 3) PDF·고화질 주소는 HTML 에 그대로 노출되지 않는다(게이트 뒤 base64 안에만).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAIN, normalizeItem, buildShareText, HIDDEN_IDS, sortNewestFirst } from './categories.mjs';
import { buildSeo } from './seo.mjs';
import { richPage } from './page.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SITE = 'https://color.uncledison.com';
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));

const raw = DATA.items;
const ids = raw.map((it) => it.id);

test('카드·편지지 정적 데이터: 64종(4장 세트 34 · 1장 뒤집기 10 · 엽서 20), 모두 카드·편지지 대분류', () => {
  assert.equal(raw.length, 64);
  const sets = raw.filter((it) => it.type === 'series');
  const flips = raw.filter((it) => it.type === 'single' && !it.postcard);
  const postcards = raw.filter((it) => it.postcard);
  assert.equal(sets.length, 34);
  assert.equal(flips.length, 10);
  assert.equal(postcards.length, 20);
  for (const it of raw) {
    const norm = normalizeItem(it);
    assert.equal(norm.mainCategory, MAIN.CARD, it.id);
    assert.equal(norm.audience, '', `${it.id}: 카드에는 대상 구분을 쓰지 않는다`);
    assert.equal(norm.cardSet, true, `${it.id}: 카드 세트 표시 누락`);
    assert.ok(it.tags.includes('크리스마스'), `${it.id}: 크리스마스 태그 누락`);
    for (const pg of norm.pages) {
      assert.ok(pg.story && pg.spec, `${it.id} ${pg.n}장: 설명·규격 누락`);
    }
  }
  for (const it of sets) {
    const norm = normalizeItem(it);
    assert.equal(norm.pageCount, 4);
    assert.equal(norm.pages.length, 4);
    assert.deepEqual(
      norm.pages.map((p) => p.name),
      ['카드', '카드 봉투', '편지지', '편지 봉투']
    );
    assert.match(it.title, /카드|편지/);
  }
  for (const it of flips) {
    const norm = normalizeItem(it);
    assert.equal(norm.pageCount, 1, it.id);
    assert.equal(norm.pages.length, 1, it.id);
    assert.match(it.sizes, /A4 1장/);
    assert.match(it.sizes, /116mm/);
    assert.match(it.title, /플립카드/);
  }
  for (const it of postcards) {
    const norm = normalizeItem(it);
    assert.equal(it.id.startsWith('postcard-'), true, `${it.id}: 엽서 id 는 postcard-*`);
    assert.equal(norm.type, 'single');
    assert.equal(norm.pageCount, 1, it.id);
    assert.equal(norm.pages.length, 1, it.id);
    assert.match(it.sizes, /A4 1장/);
    assert.match(it.sizes, /엽서 2장/);
    assert.match(it.title, /엽서/);
    assert.match(it.pages[0].spec, /엽서/);
  }
  assert.equal(new Set(ids).size, ids.length, 'id 중복');
});

test('최신순 정렬: 새로 올린 네이비 산타 썰매가 맨 위, 그다음 카드 세트 9종·성인용 엽서 10종이 온다', () => {
  const sorted = sortNewestFirst(raw.map(normalizeItem));
  assert.equal(sorted.length, raw.length);
  const top10 = sorted.slice(0, 10);
  assert.deepEqual(top10.map((it) => it.id), [
    'xmas-35-papercut-navy-sleigh',
    'xmas-26-white-joy', 'xmas-27-white-pine-tree', 'xmas-28-white-arch-ornaments',
    'xmas-29-bigface-santa', 'xmas-30-bigface-snowman', 'xmas-31-bigface-rudolph',
    'xmas-32-papercut-green-forest', 'xmas-33-papercut-red-village',
    'xmas-34-papercut-kraft-ornament',
  ]);
  const next10 = sorted.slice(10, 20);
  assert.ok(next10.every((it) => it.postcard), '엽서 10종이 카드 세트 다음이 아니다: ' + next10.map((it) => it.id).join(', '));
  assert.equal(next10[0].id, 'postcard-diecut-01-tree');
  assert.equal(next10[9].id, 'postcard-classic-05-stamps');
  // 날짜(최신순)가 흐트러지지 않는다
  const ts = sorted.map((it) => Date.parse(it.updated));
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i - 1] >= ts[i], `${sorted[i - 1].id} → ${sorted[i].id} 순서 오류`);
  // 원본 배열은 건드리지 않는다
  assert.equal(raw[0].id, 'xmas-01-hiphop-santa');
});

test('사이트에서 내린 도안(접는 크리스마스 카드 만들기 — 산타와 트리)은 숨김 목록에만 있고 카드 데이터에는 없다', () => {
  // build.mjs 가 Notion 데이터를 읽은 뒤 HIDDEN_IDS 로 걸러내므로 data.json·홈·sitemap·/p 에서 빠진다.
  assert.ok(HIDDEN_IDS.has('card-christmas-fold-santa'));
  for (const it of raw) assert.ok(!HIDDEN_IDS.has(it.id), `${it.id}: 숨김 목록의 id 가 카드 데이터에 남아 있다`);
});

test('카드·편지지 정적 데이터가 가리키는 파일이 저장소에 있다', () => {
  const exists = (url) => fs.existsSync(path.join(ROOT, 'assets', url.replace(/^\/cards\//, 'cards/')));
  for (const it of raw) {
    const files = [it.cover, it.thumb, it.og, it.promo, it.setPdf];
    for (const pg of it.pages) files.push(pg.preview, pg.small, pg.print);
    for (const f of files) {
      assert.ok(f.startsWith('/cards/'), `${it.id}: /cards/ 경로가 아님 (${f})`);
      assert.ok(exists(f), `${it.id}: 파일 없음 ${f}`);
    }
    // Cloudflare Pages 파일당 25MB 제한
    const size = fs.statSync(path.join(ROOT, 'assets', it.setPdf.replace(/^\/cards\//, 'cards/'))).size;
    assert.ok(size < 25 * 1024 * 1024, `${it.id}: 세트 PDF 가 25MB 초과 (${size})`);
  }
});

function it0() {
  return raw[0];
}

// build.mjs 의 enrich() 중 정적 항목 처리와 같은 모양을 만든다
function cardItem(src = it0()) {
  const it = normalizeItem(src);
  return {
    ...it,
    cloud: 'dhfobwnfc',
    categoryLabel: it.category,
    url: `${SITE}/p/${it.id}`,
    og: `${SITE}${it.og}`,
    thumb: it.thumb,
    promo: it.promo,
    pages: it.pages.map((pg, i) => ({ ...pg, n: Number(pg.n) || i + 1 })),
    shareText: buildShareText(it, SITE),
  };
}

const render = (it) => richPage(it, { seo: buildSeo(it, { site: SITE }), related: [] });

function resOf(html) {
  const m = html.match(/const RES="([A-Za-z0-9+/=]+)"/);
  assert.ok(m, 'RES(게이트 뒤 주소) 누락');
  return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
}

test('/p 카드 세트: 4장 미리보기 + 장별 인쇄 + 세트 PDF 버튼', () => {
  const it = cardItem();
  const html = render(it);
  assert.equal((html.match(/<canvas class="pv" data-pv="\d+"/g) || []).length, 4);
  assert.equal((html.match(/class="sheet"/g) || []).length, 4);
  for (const pg of it.pages) {
    assert.ok(html.includes(pg.small), `${pg.n}장 미리보기 주소 누락`);
    assert.ok(html.includes(pg.story), `${pg.n}장 설명 누락`);
    assert.ok(html.includes(pg.name), `${pg.n}장 이름(카드·봉투 등) 누락`);
    assert.ok(html.includes(pg.spec), `${pg.n}장 규격 누락`);
  }
  assert.match(html, /askPrint\(\d\)/);          // 장별 인쇄
  assert.match(html, /askSetPdf\(\)/);           // 세트 PDF
  assert.match(html, /A4 PDF 4장 한 번에 받기/);
  assert.ok(html.includes('카드 95×135mm'), '구성·규격 안내 누락');
  // 카드 세트는 장별 '저장' 대신 세트 PDF 하나로 받는다
  assert.ok(!/askDownload\(\d/.test(html), '카드 세트에 장별 저장 버튼이 남아 있다');
});

test('/p 카드 세트: 세트 PDF·인쇄 주소는 게이트 뒤(base64)에서만 풀린다', () => {
  const it = cardItem();
  const html = render(it);
  const res = resOf(html);
  assert.equal(res.length, 4);
  for (const entry of res) {
    assert.equal(entry.set, it.setPdf);
    assert.equal(entry.setName, it.downloadName);
  }
  assert.equal(res[1].print, it.pages[1].print);
  // HTML 본문에 PDF·인쇄용 이미지 주소가 직접 노출되면 게이트가 뚫린다
  assert.ok(!html.includes('href="' + it.setPdf + '"'), '세트 PDF 직접 링크 금지');
  assert.ok(!html.includes(it.pages[0].print), '인쇄용 주소가 HTML 에 노출됨');
  assert.match(html, /openGate\('PDF 저장',function\(\)\{[\s\S]{0,200}unlockUrls\(\)/);
  assert.match(html, /var s=3;/);                // 3초
  assert.ok(!/cdFill 5s/.test(html), '5초 게이트가 남아 있으면 안 된다');
});

test('/p 카드 세트: SEO 메타·OG·JSON-LD', () => {
  const it = cardItem();
  const html = render(it);
  const seo = buildSeo(it, { site: SITE });
  assert.match(seo.title, /크리스마스 카드 도안/);
  assert.ok(seo.title.length <= 62, `제목 길이 초과: ${seo.title.length}`);
  assert.ok(seo.description.length <= 155, `설명 길이 초과: ${seo.description.length}`);
  assert.match(seo.description, /A4/);
  assert.ok(seo.keywords.includes('크리스마스 편지지'));
  assert.ok(html.includes('<title>' + seo.title.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>'));
  // og:image 는 절대 주소(로컬 /cards/ 경로를 그대로 쓰면 카톡·검색이 못 읽는다)
  assert.ok(html.includes(`<meta property="og:image" content="${SITE}${it.og.replace(SITE, '')}">`));
  assert.match(html, /<meta property="og:image" content="https:\/\/color\.uncledison\.com\/cards\//);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'CreativeWork');
  assert.equal(ld.url, it.url);
});

test('공유 문구: 카드·편지지 문구로 분기', () => {
  const it = normalizeItem(it0());
  const text = buildShareText(it, SITE);
  assert.match(text, /💌/);
  assert.match(text, /\(카드·편지지\)/);
  assert.ok(text.includes(`${SITE}/p/${it.id}`));
});

/* ── 1장 플립카드(xmas-flip-*) ─────────────────────────────────── */
const flip0 = raw.find((it) => it.id === 'xmas-flip-01-snowman');

function flipItem(src = flip0) {
  const it = normalizeItem(src);
  return {
    ...it,
    cloud: 'dhfobwnfc',
    categoryLabel: it.category,
    url: `${SITE}/p/${it.id}`,
    og: `${SITE}${it.og}`,
    thumb: it.thumb,
    promo: it.promo,
    pages: it.pages.map((pg, i) => ({ ...pg, n: Number(pg.n) || i + 1 })),
    shareText: buildShareText(it, SITE),
  };
}

test('/p 플립카드: A4 1장 미리보기 + 1장 PDF 버튼', () => {
  const it = flipItem();
  const html = render(it);
  // 1장짜리는 장 그리드가 아니라 큰 미리보기 한 장
  assert.equal((html.match(/<canvas class="pv" data-pv="\d+"/g) || []).length, 1);
  assert.ok(html.includes(it.pages[0].small), '1장 미리보기 주소 누락');
  assert.match(html, /askSetPdf\(\)/);
  assert.match(html, /A4 PDF 1장 받기/);
  assert.ok(html.includes('A4 1장 · 완성 지름 116mm'), '규격 안내 누락');
  assert.ok(!/askDownload\(\d/.test(html), '플립카드에 장별 저장 버튼이 남아 있다');
  assert.ok(!/카드 봉투|편지 봉투/.test(html), '플립카드에 4장 세트 문구가 남아 있다');
  const res = resOf(html);
  assert.equal(res.length, 1);
  assert.equal(res[0].set, it.setPdf);
  assert.equal(res[0].setName, it.downloadName);
  assert.equal(res[0].pages, 1);
  assert.ok(!html.includes('href="' + it.setPdf + '"'), 'PDF 직접 링크 금지');
});

test('/p 플립카드: SEO 설명이 1장 카드로 분기', () => {
  const it = flipItem();
  const seo = buildSeo(it, { site: SITE });
  assert.match(seo.title, /플립카드/);
  assert.ok(seo.title.length <= 62, `제목 길이 초과: ${seo.title.length}`);
  assert.ok(seo.description.length <= 155, `설명 길이 초과: ${seo.description.length}`);
  assert.match(seo.description, /플립카드/);
  assert.ok(!/4장/.test(seo.description), '1장 카드에 4장 설명이 남아 있다');
  assert.ok(seo.keywords.includes('플립카드'));
  assert.ok(seo.keywords.includes('뒤집기 카드'), '옛 이름 검색어도 유지');
});

/* ── 엽서(postcard-*) — A4 가로 1장 = 엽서 2장 ─────────────────────── */
const post0 = raw.find((it) => it.id === 'postcard-rect-01-village');
const postShape0 = raw.find((it) => it.id === 'postcard-shape-01-tree');

function postItem(src = post0) {
  const it = normalizeItem(src);
  return {
    ...it,
    cloud: 'dhfobwnfc',
    categoryLabel: it.category,
    url: `${SITE}/p/${it.id}`,
    og: `${SITE}${it.og}`,
    thumb: it.thumb,
    promo: it.promo,
    pages: it.pages.map((pg, i) => ({ ...pg, n: Number(pg.n) || i + 1 })),
    shareText: buildShareText(it, SITE),
  };
}

test('/p 엽서: A4 가로 1장 미리보기 + 1장 PDF 버튼, 플립카드 문구 없음', () => {
  const it = postItem();
  const html = render(it);
  // 1장짜리는 장 그리드가 아니라 큰 미리보기 한 장 (가로 700×495 비율)
  assert.equal((html.match(/<canvas class="pv" data-pv="\d+"/g) || []).length, 1);
  assert.match(html, /width="520" height="368"/);
  assert.ok(html.includes(it.pages[0].small), '엽서 미리보기 주소 누락');
  assert.match(html, /askSetPdf\(\)/);
  assert.match(html, /A4 PDF 1장 받기/);
  assert.ok(html.includes('1장 · 엽서 2장'), '엽서 장수 안내 누락');
  assert.ok(html.includes('A4 1장 · 엽서 2장 (100×150mm)'), '규격 안내 누락');
  assert.match(html, /<b>A4 · 가로<\/b>/); // 인쇄는 A4 가로
  assert.ok(!/뒤집기|플립/.test(html), '엽서에 플립카드 문구가 남아 있다');
  assert.ok(!/카드 봉투|편지 봉투/.test(html), '엽서에 4장 세트 문구가 남아 있다');
  assert.ok(!/askDownload\(\d/.test(html), '엽서에 장별 저장 버튼이 남아 있다');
  // 인쇄 iframe 은 A4 가로로 뽑아야 한다
  assert.ok(html.includes('const A4LANDSCAPE=true;'), '엽서 인쇄 방향(가로) 플래그 누락');
  const res = resOf(html);
  assert.equal(res.length, 1);
  assert.equal(res[0].set, it.setPdf);
  assert.equal(res[0].setName, it.downloadName);
  assert.equal(res[0].pages, 1);
  assert.ok(!html.includes('href="' + it.setPdf + '"'), 'PDF 직접 링크 금지');
});

test('/p 엽서: 모양 엽서도 같은 규칙(가로 · 엽서 2장)', () => {
  const html = render(postItem(postShape0));
  assert.ok(html.includes('A4 1장 · 모양 엽서 2장'), '모양 엽서 규격 안내 누락');
  assert.ok(html.includes('const A4LANDSCAPE=true;'));
  assert.ok(!/뒤집기|플립/.test(html));
});

test('/p 엽서: SEO 가 엽서 도안으로 분기', () => {
  const it = postItem();
  const seo = buildSeo(it, { site: SITE });
  assert.match(seo.title, /엽서/);
  assert.ok(seo.title.length <= 62, `제목 길이 초과: ${seo.title.length}`);
  assert.ok(seo.description.length <= 155, `설명 길이 초과: ${seo.description.length}`);
  assert.match(seo.description, /엽서/);
  assert.ok(!/뒤집기|플립/.test(seo.description), '엽서 설명에 뒤집기 문구가 남아 있다');
  assert.ok(seo.keywords.includes('크리스마스 엽서 도안'));
});
