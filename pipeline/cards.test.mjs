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

import { MAIN, normalizeItem, buildShareText } from './categories.mjs';
import { buildSeo } from './seo.mjs';
import { richPage } from './page.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SITE = 'https://color.uncledison.com';
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));

const raw = DATA.items;
const ids = raw.map((it) => it.id);

test('카드·편지지 정적 데이터: 9종 세트, 모두 카드·편지지 대분류', () => {
  assert.equal(raw.length, 9);
  for (const it of raw) {
    const norm = normalizeItem(it);
    assert.equal(norm.mainCategory, MAIN.CARD, it.id);
    assert.equal(norm.audience, '', `${it.id}: 카드에는 대상 구분을 쓰지 않는다`);
    assert.equal(norm.type, 'series');
    assert.equal(norm.pageCount, 4);
    assert.equal(norm.pages.length, 4);
    assert.deepEqual(
      norm.pages.map((p) => p.name),
      ['카드', '카드 봉투', '편지지', '편지 봉투']
    );
    for (const pg of norm.pages) {
      assert.ok(pg.story && pg.spec, `${it.id} ${pg.n}장: 설명·규격 누락`);
    }
    assert.match(it.title, /카드|편지/);
    assert.ok(it.tags.includes('크리스마스'), `${it.id}: 크리스마스 태그 누락`);
  }
  assert.equal(new Set(ids).size, ids.length, 'id 중복');
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
