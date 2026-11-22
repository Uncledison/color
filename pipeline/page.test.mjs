// pipeline/page.test.mjs — 도안 상세 페이지(/p/<id>) 렌더링 & 홈 하위호환
//
// 지키려는 것
// 1) 검색·SNS로 바로 들어온 사람이 /p/<id> 에서 미리보기·인쇄·저장·링크 복사를 다 할 수 있다.
// 2) SEO 메타(<title>·description·og:*·canonical·JSON-LD)와 내부 링크가 그대로 남는다.
// 3) 옛 /#<id> 링크는 홈에서 계속 열리고, 주소창만 /p/<id> 로 바뀐다.
// 4) 5초 게이트를 건너뛰는 길(전체 인쇄·화질 높은 확대 보기·DOM 속 고화질 <img>)이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAIN } from './categories.mjs';
import { buildSeo } from './seo.mjs';
import { richPage, relatedFor, esc } from './page.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SITE = 'https://color.unledison.com';

const CDN = 'https://res.cloudinary.com/dhfobwnfc/image/upload';

function makeItem({ id = 'winter-closet-swap', type = 'series', pages = 8, ...rest } = {}) {
  const pageList = Array.from({ length: pages }, (_, i) => {
    const n = i + 1;
    const publicId = `uncledison/coloring/${id}/${id}_${String(n).padStart(2, '0')}`;
    const preview = `${CDN}/f_auto,q_auto,w_900,c_limit/${publicId}`;
    return {
      n,
      publicId,
      story: `${n}번째 장 이야기입니다.`,
      preview,
      small: `${CDN}/f_auto,q_auto,w_560,c_limit/${publicId}`,
      print: `${CDN}/f_png,q_auto,w_1240,c_limit/${publicId}`,
      social: `${CDN}/f_auto,q_auto,w_600,c_limit/${publicId}`,
      download: `${CDN}/f_png,q_auto/fl_attachment:${id}-${String(n).padStart(2, '0')}/${publicId}`,
    };
  });

  return {
    id,
    type,
    title: '겨울 옷장 대소동',
    category: '계절',
    tags: ['겨울'],
    difficulty: 2,
    desc: '겨울옷을 꺼내는 날의 소동을 그린 8컷 색칠도안입니다.',
    pageCount: pages,
    mainCategory: MAIN.COLOR,
    audience: '',
    categoryLabel: '계절',
    cover: `uncledison/coloring/${id}/${id}_01`,
    url: `https://color.uncledison.com/p/${id}`,
    thumb: `${CDN}/f_auto,q_auto,w_500,h_700,c_fill,g_north/${id}_01`,
    og: `${CDN}/f_auto,q_auto,w_1200,h_630,c_pad,b_rgb:faf7f3/${id}-grid`,
    promo: `${CDN}/f_auto,q_auto,w_600,c_limit/${id}_01`,
    pages: pageList,
    shareText: `🎨 겨울 옷장 대소동 (색칠도안 8장)\n\n겨울옷을 꺼내는 날의 소동.\n무료로 다운받아 색칠해보세요!\n\n👉 https://color.uncledison.com/p/${id}`,
    ...rest,
  };
}

const render = (it, related = []) => richPage(it, { seo: buildSeo(it, { site: 'https://color.uncledison.com' }), related });

// RES(base64)에 담긴 인쇄·저장 주소를 테스트에서도 풀어 본다
function resOf(html) {
  const m = html.match(/const RES="([A-Za-z0-9+/=]+)"/);
  assert.ok(m, 'RES(게이트 뒤 고화질 주소) 누락');
  return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
}

test('/p 시리즈: 모든 장의 미리보기·인쇄·저장이 한 페이지 안에 있다', () => {
  const it = makeItem();
  const html = render(it);
  for (const pg of it.pages) {
    assert.ok(html.includes(pg.small), `${pg.n}장 미리보기(저해상 캔버스) 주소 누락`);
    assert.ok(html.includes(pg.story), `${pg.n}장 이야기 누락`);
  }
  // 인쇄·저장 URL은 화면 HTML이 아니라 게이트 뒤에 풀리는 base64에 들어 있다
  const res = resOf(html);
  assert.equal(res.length, 8);
  for (const pg of it.pages) {
    assert.equal(res[pg.n - 1].print, pg.print, `${pg.n}장 인쇄 URL 누락`);
    assert.equal(res[pg.n - 1].download, pg.download, `${pg.n}장 다운로드 URL 누락`);
  }
  assert.equal((html.match(/class="sheet"/g) || []).length, 8);
  assert.match(html, /askDownload\(\d/);           // 장별 저장 버튼
  assert.match(html, /copyShare\(\)/);             // 링크 복사
});

test('/p 시리즈: 미리보기는 캔버스에 그린다(지연 로딩 대신 화면에 들어올 때)', () => {
  const html = render(makeItem());
  assert.equal((html.match(/<canvas class="pv" data-pv="\d+"/g) || []).length, 8);
  assert.match(html, /IntersectionObserver/);
  assert.ok(!/loading="lazy"/.test(html), '이미지 지연 로딩은 더 이상 쓰지 않는다');
});

test('/p: SEO 메타·canonical·JSON-LD가 그대로 살아 있다', () => {
  const it = makeItem();
  const seo = buildSeo(it, { site: 'https://color.uncledison.com' });
  const html = render(it);
  assert.ok(html.includes(`<title>${esc(seo.title)}</title>`));
  assert.ok(html.includes(`<meta name="description" content="${esc(seo.description)}">`));
  assert.ok(html.includes(`<link rel="canonical" href="${it.url}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${it.url}">`));
  assert.ok(html.includes(`<meta property="og:image" content="${it.og}">`));
  assert.match(html, /<meta name="robots" content="index,follow/);

  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'JSON-LD 누락');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@type'], 'CreativeWork');
  assert.equal(ld.name, it.title);
  assert.equal(ld.url, it.url);
});

test('/p: 링크 복사는 정식 /p/ 주소 하나만 복사한다', () => {
  const it = makeItem();
  const html = render(it);
  const m = html.match(/const SHEET_DATA=(\{.*?\});\n/s);
  assert.ok(m, 'SHEET_DATA 누락');
  const data = JSON.parse(m[1]);
  assert.equal(data.url, it.url);
  // 주소창·링크 입력칸에 그대로 붙여넣을 수 있게 긴 공유 문구는 더 이상 만들지 않는다
  assert.ok(!('shareText' in data), '공유 문구가 남아 있으면 안 된다');
  assert.match(html, /navigator\.clipboard\.writeText\(url\)/);
  assert.ok(!/#winter-closet-swap/.test(html), '옛 /#주소가 남으면 안 된다');
});

test('/p: 인쇄·저장은 홈과 같은 5초 커피 게이트를 거친다', () => {
  const html = render(makeItem());
  assert.match(html, /function openGate\(/);
  assert.match(html, /id="skipBtn"/);
  assert.match(html, /cdFill 5s linear forwards/);
  assert.match(html, /qr\.kakaopay\.com/);
  // 게이트를 거치지 않는 직접 다운로드 링크가 남아 있으면 정책이 뚫린다
  assert.equal((html.match(/class="btn[^"]*"[^>]*href="https:\/\/res\.cloudinary\.com/g) || []).length, 0);
  // 고화질 주소는 게이트 실행 함수 안에서만 풀린다
  assert.match(html, /openGate\('인쇄',function\(\)\{[\s\S]{0,160}unlockUrls\(\)/);
  assert.match(html, /openGate\('다운로드',function\(\)\{[\s\S]{0,160}unlockUrls\(\)/);
});

test('/p: 전체 인쇄·화질 좋은 확대(라이트박스)가 없다', () => {
  const html = render(makeItem());
  assert.ok(!/전체 인쇄/.test(html), '전체 인쇄 버튼이 남아 있으면 게이트가 뚫린다');
  assert.ok(!/openZoom/.test(html), '확대 보기가 남아 있으면 안 된다');
  assert.ok(!/zoomImg|zoomPrev|zoomNext/.test(html), '라이트박스 DOM이 남아 있으면 안 된다');
  assert.ok(!/askPrint\(\)/.test(html), '장 번호 없는 인쇄 호출이 남아 있으면 안 된다');
  assert.ok(!/printSheets/.test(html), '여러 장 인쇄 함수가 남아 있으면 안 된다');
  assert.match(html, /function printSheet\(src\)/);   // 한 장짜리 인쇄만 남는다
  assert.match(html, /askPrint\(\d\)/);
});

test('/p: 미리보기 DOM에 고화질 이미지(<img src>)나 고화질 주소가 없다', () => {
  const html = render(makeItem());
  assert.equal((html.match(/<img[^>]+res\.cloudinary\.com/g) || []).length, 0, '도안 <img> 태그가 남아 있다');
  assert.ok(!/w_900/.test(html), '고해상 미리보기 주소가 노출되면 안 된다');
  assert.ok(!/w_1240/.test(html), '인쇄용 주소가 HTML에 노출되면 안 된다');
  assert.ok(!/fl_attachment/.test(html), '다운로드용 주소가 HTML에 노출되면 안 된다');
  assert.ok(!/data-src=|data-preview=/.test(html), '주소를 담은 data 속성을 두지 않는다');
  assert.equal((html.match(/<canvas class="pv"/g) || []).length, 8);
  assert.equal((html.match(/class="shield"/g) || []).length, 8);
  // SNS·검색용 메타는 그대로 남는다
  assert.match(html, /<meta property="og:image" content="https:\/\/res\.cloudinary\.com/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/res\.cloudinary\.com/);
});

test('/p: 우클릭·드래그·길게 누르기 저장을 막는다', () => {
  const html = render(makeItem());
  assert.match(html, /addEventListener\('contextmenu',function\(e\)\{e\.preventDefault\(\);return false\},true\)/);
  assert.match(html, /addEventListener\('dragstart',function\(e\)\{e\.preventDefault\(\);return false\},true\)/);
  assert.match(html, /user-select:none/);
  assert.match(html, /-webkit-touch-callout:none/);
  assert.match(html, /-webkit-user-drag:none/);
  assert.match(html, /\.shield\{position:absolute;inset:0/);   // 투명 방어막
});

test('/p: Ctrl+P 로는 도안이 인쇄되지 않고 안내문만 나온다', () => {
  const html = render(makeItem());
  assert.match(html, /@media print\{/);
  assert.match(html, /body \*\{visibility:hidden!important\}/);
  assert.match(html, /class="print-only"/);
  assert.match(html, /한 장씩 인쇄해 주세요/);
  assert.ok(!/\.grid\{display:block\}/.test(html), '인쇄 시 그리드를 그대로 내보내면 전장 인쇄가 된다');
});

test('/p 단일 워크시트: A4 미리보기 + 인쇄 + 다운로드 + 링크 복사', () => {
  const it = makeItem({ id: 'sticker-scarf-50', type: 'single', pages: 1, mainCategory: MAIN.LIFE, category: '칭찬스티커판' });
  const html = render(it);
  assert.match(html, /A4로 인쇄/);
  assert.match(html, /다운로드/);
  assert.match(html, /copyShare\(\)/);
  assert.ok(html.includes(it.pages[0].small), '저해상 미리보기 주소 누락');
  assert.equal(resOf(html)[0].download, it.pages[0].download);
  assert.equal((html.match(/class="sheet"/g) || []).length, 0); // 단일은 카드 목록 대신 큰 A4 한 장
  assert.match(html, /도안 미리보기/);
  assert.equal((html.match(/<canvas class="pv"/g) || []).length, 1);
});

test('/p: 홈으로 돌아가는 링크가 분명히 있다', () => {
  const html = render(makeItem());
  assert.ok(html.includes('href="/"'), '홈 링크 누락');
  assert.match(html, /전체 도안 보기/);
  assert.match(html, /홈에서 .* 더 보기/);
});

test('/p: 관련 도안 내부 링크(같은 분류 우선, 최대 6개)', () => {
  const it = makeItem();
  const items = [
    it,
    makeItem({ id: 'a', category: '계절' }),
    makeItem({ id: 'b', category: '계절' }),
    makeItem({ id: 'c', category: '동화' }),
    makeItem({ id: 'd', category: '전통' }),
    makeItem({ id: 'e', category: '자연' }),
    makeItem({ id: 'f', category: '바다' }),
    makeItem({ id: 'g', category: '겨울' }),
    makeItem({ id: 'h', category: '여름' }),
    makeItem({ id: 'skip-me', mainCategory: MAIN.BRAIN, category: '미로찾기' }),
  ];
  const rel = relatedFor(it, items);
  assert.equal(rel.length, 6);
  assert.ok(!rel.some((r) => r.id === it.id), '자기 자신은 관련 도안에서 빠져야 한다');
  assert.ok(!rel.some((r) => r.id === 'skip-me'), '다른 대분류는 넣지 않는다');
  assert.deepEqual(rel.slice(0, 2).map((r) => r.category), ['계절', '계절']);

  const html = render(it, rel);
  for (const r of rel) assert.ok(html.includes(`href="/p/${r.id}"`), `${r.id} 링크 누락`);
});

test('/p: 제목·이야기의 HTML이 그대로 실행되지 않게 escape 된다', () => {
  const it = makeItem({ title: '제목 </script><script>alert(1)</script>' });
  it.pages[0].story = '이야기 <img src=x onerror=alert(1)>';
  const html = render(it);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror'));
  assert.ok(html.includes('&lt;script&gt;alert(1)'));
  // SHEET_DATA 안에서도 </script> 로 스크립트가 끊기지 않는다
  const m = html.match(/const SHEET_DATA=(\{.*?\});\n/s);
  assert.ok(m);
  assert.ok(!m[1].includes('</script'));
});

test('esc: 필수 문자 escape', () => {
  assert.equal(esc('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

// ── 홈(index.html) 하위 호환: 옛 /#<id> 링크는 계속 열려야 한다 ──
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('홈: 옛 /#<id> 주소를 그대로 읽어서 모달을 연다', () => {
  assert.match(INDEX, /location\.hash\.slice\(1\)/);
  assert.match(INDEX, /if\(h&&byId\[h\]\) openModal\(h\)/);
});

test('홈: 모달을 열면 주소창이 /p/<id> 로 바뀐다', () => {
  assert.match(INDEX, /function itemPath\(id\)\{return '\/p\/'\+encodeURIComponent\(id\)\}/);
  assert.match(INDEX, /history\.replaceState\(null, '', id\?itemPath\(id\):'\/'\)/);
  // 닫으면 홈 주소로 되돌아온다
  assert.match(INDEX, /setModalUrl\(null\)/);
});

test('홈: 링크 복사는 /p/<id> 정식 주소 하나만 복사한다', () => {
  assert.match(INDEX, /function shareUrlFor\(it\)\{return SITE_URL\+itemPath\(it\.id\)\}/);
  assert.match(INDEX, /const url=shareUrlFor\(current\)/);
  assert.match(INDEX, /navigator\.clipboard\.writeText\(url\)/);   // 주소만 복사(문구 아님)
  assert.ok(!/shareTextFor/.test(INDEX), '여러 줄 공유 문구를 만들면 주소창에 붙여도 안 열린다');
  assert.ok(!/history\.replaceState\(null, '', '#'\+/.test(INDEX), '옛 #주소 replaceState가 남아 있으면 안 된다');
});

test('홈: 카드·시리즈·모달 미리보기는 캔버스이고 도안 <img src>가 없다', () => {
  assert.match(INDEX, /function pvHTML\(/);
  assert.match(INDEX, /pvHTML\(it\.thumb,300,420/);                  // 카드
  assert.match(INDEX, /pvHTML\(p\.small\|\|p\.preview,120,162/);      // 시리즈 썸네일(옛 w_900 노출 제거)
  assert.match(INDEX, /pvHTML\(pg\.small\|\|pg\.preview,620,877/);    // 모달 미리보기
  assert.ok(!/'<img src="'\+it\.thumb/.test(INDEX), '카드 썸네일 <img> 금지');
  assert.ok(!/'<img src="'\+p\.preview/.test(INDEX), '시리즈 썸네일 <img> 금지');
  assert.ok(!/'<img src="'\+pg\.preview/.test(INDEX), '모달 미리보기 <img> 금지');
});

test('홈: 우클릭·드래그·길게 누르기 차단과 Ctrl+P 보호가 있다', () => {
  assert.match(INDEX, /addEventListener\('contextmenu',e=>\{e\.preventDefault\(\);return false\},true\)/);
  assert.match(INDEX, /addEventListener\('dragstart',e=>\{e\.preventDefault\(\);return false\},true\)/);
  assert.match(INDEX, /-webkit-touch-callout:none/);
  assert.match(INDEX, /\.shield\{position:absolute;inset:0/);
  assert.match(INDEX, /class="print-only"/);
  assert.match(INDEX, /@media print\{/);
});

test('홈: 주소가 /p/<id> 여도 상대 링크가 홈 기준으로 풀린다(<base>)', () => {
  assert.match(INDEX, /<base href="\/">/);
});

test('Service Worker: 캐시를 쓰지 않아 배포 후 옛 /p/ 페이지가 남지 않는다', () => {
  assert.ok(!/caches\.open/.test(SW));
  assert.ok(!/cache\.put/.test(SW));
  assert.match(SW, /req\.mode === 'navigate'/);
  assert.match(SW, /cache: 'no-store'/);
});
