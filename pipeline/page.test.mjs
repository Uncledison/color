// pipeline/page.test.mjs — 도안 상세 페이지(/p/<id>) 렌더링 & 홈 하위호환
//
// 지키려는 것
// 1) 검색·SNS로 바로 들어온 사람이 /p/<id> 에서 미리보기·인쇄·저장·공유를 다 할 수 있다.
// 2) SEO 메타(<title>·description·og:*·canonical·JSON-LD)와 내부 링크가 그대로 남는다.
// 3) 옛 /#<id> 링크는 홈에서 계속 열리고, 주소창만 /p/<id> 로 바뀐다.
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

test('/p 시리즈: 모든 장의 미리보기·인쇄·저장 URL이 한 페이지에 있다', () => {
  const it = makeItem();
  const html = render(it);
  for (const pg of it.pages) {
    assert.ok(html.includes(pg.small), `${pg.n}장 그리드 미리보기 누락`);
    assert.ok(html.includes(pg.print), `${pg.n}장 인쇄 URL 누락`);
    assert.ok(html.includes(pg.download), `${pg.n}장 다운로드 URL 누락`);
    assert.ok(html.includes(pg.story), `${pg.n}장 이야기 누락`);
  }
  assert.equal((html.match(/class="sheet"/g) || []).length, 8);
  assert.match(html, /전체 인쇄/);                 // 한 번에 인쇄
  assert.match(html, /askDownload\(\d/);           // 장별 저장 버튼
  assert.match(html, /copyShare\(\)/);             // 공유 복사
});

test('/p 시리즈: 첫 장은 즉시, 나머지는 지연 로딩', () => {
  const html = render(makeItem());
  const first = html.slice(0, html.indexOf('class="sheet"') + 200);
  assert.ok(!first.includes('loading="lazy"'));
  assert.ok((html.match(/loading="lazy"/g) || []).length >= 7);
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

test('/p: 공유 문구에는 항상 정식 /p/ 주소가 들어간다', () => {
  const it = makeItem();
  const html = render(it);
  const m = html.match(/const SHEET_DATA=(\{.*?\});\n/s);
  assert.ok(m, 'SHEET_DATA 누락');
  const data = JSON.parse(m[1]);
  assert.equal(data.url, it.url);
  assert.match(data.shareText, /https:\/\/color\.uncledison\.com\/p\/winter-closet-swap/);
  assert.ok(!/#winter-closet-swap/.test(data.shareText), '옛 /#주소가 공유 문구에 남으면 안 된다');
});

test('/p: 인쇄·저장은 홈과 같은 5초 커피 게이트를 거친다', () => {
  const html = render(makeItem());
  assert.match(html, /function openGate\(/);
  assert.match(html, /id="skipBtn"/);
  assert.match(html, /cdFill 5s linear forwards/);
  assert.match(html, /qr\.kakaopay\.com/);
  // 게이트를 거치지 않는 직접 다운로드 링크가 남아 있으면 정책이 뚫린다
  assert.equal((html.match(/class="btn[^"]*"[^>]*href="https:\/\/res\.cloudinary\.com/g) || []).length, 0);
});

test('/p 단일 워크시트: A4 미리보기 + 인쇄 + 다운로드 + 공유', () => {
  const it = makeItem({ id: 'sticker-scarf-50', type: 'single', pages: 1, mainCategory: MAIN.LIFE, category: '칭찬스티커판' });
  const html = render(it);
  assert.match(html, /A4로 인쇄/);
  assert.match(html, /다운로드/);
  assert.match(html, /copyShare\(\)/);
  assert.ok(html.includes(it.pages[0].preview));
  assert.ok(html.includes(it.pages[0].download));
  assert.equal((html.match(/class="sheet"/g) || []).length, 0); // 단일은 카드 목록 대신 큰 A4 한 장
  assert.match(html, /도안 미리보기/);
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

test('홈: 공유 복사는 /p/<id> 정식 주소를 쓴다(옛 /#주소 아님)', () => {
  assert.match(INDEX, /function shareUrlFor\(it\)\{return SITE_URL\+itemPath\(it\.id\)\}/);
  assert.match(INDEX, /split\('👉'\)\[0\]/);           // data.json의 옛 링크 줄은 버리고
  assert.match(INDEX, /`\\n\\n👉 \$\{url\}`/);          // 정식 주소로 다시 붙인다
  assert.ok(!/history\.replaceState\(null, '', '#'\+/.test(INDEX), '옛 #주소 replaceState가 남아 있으면 안 된다');
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
