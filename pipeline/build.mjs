// pipeline/build.mjs  —  Vercel 빌드에서 실행 (vercel.json의 buildCommand)
// 1) Notion(공개=true) → 표준 items  2) Cloudinary URL 주입  3) public/data.json
// 4) 도안별 OG 정적페이지 public/p/<id>.html  5) index.html을 public/로 복사
//
// NOTION_TOKEN 이 없으면 data.sample.json 으로 폴백(로컬 미리보기용).
//
// 3대분류(색칠도안 · 두뇌놀이 · 스티커판) 개편:
// - item.mainCategory / item.audience 를 항상 채운다(노션에 컬럼이 없어도 안전).
// - '단일' 유형은 시리즈용 10칸 그리드(-grid) 이미지가 없으므로 og/promo 를 대표 이미지(cover)로 만든다.
// - 공유문구·OG 문구를 대분류에 맞게 분기한다(색칠도안은 기존 문구 그대로).
// - 3번째 대분류는 '스티커판'(옛 '생활·학습판' 값은 categories.mjs에서 호환 매핑).
// - 인쇄 버튼도 다운로드와 같은 3초 커피 후원 인터스티셜을 거친 뒤 인쇄한다.
// - 워터마크: 색칠도안만 우하단 검정 워터마크 유지, 두뇌놀이·스티커판은 다운로드·인쇄·공유
//   변환에서 오버레이를 빼고 깨끗한 고해상도 이미지를 쓴다(cloudinary.mjs watermark:false).
//
// 2026-11-27 '카드·편지지'(크리스마스 카드·봉투·편지지 4장 세트) 추가:
// - 이 항목들은 노션이 아니라 레포에 커밋된 data/cards.json(정적 데이터)에서 읽는다.
//   → 노션 빌드가 다시 돌아도 카드·편지지 항목과 카드 세트 데이터는 지워지지 않는다.
// - 이미지·PDF는 Cloudinary 변환을 거치지 않고 assets/cards/<세트>/ 아래 실제 파일을
//   public/cards/ 로 복사해 그대로 서빙한다(오프라인·정적 자산).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CL from './cloudinary.mjs';
import { MAIN, MAIN_COPY, buildShareText, categoryLabel, normalizeItem } from './categories.mjs';
import { buildSeo } from './seo.mjs';
import { richPage, relatedFor, esc } from './page.mjs';
import { INDEXNOW_KEY, keyFileName, pingIndexNow, shouldPingIndexNow } from './indexnow.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

const CLOUD = process.env.CLOUDINARY_CLOUD || 'dhfobwnfc';
const SITE = (process.env.SITE_URL || 'https://color.uncledison.com').replace(/\/$/, '');

async function loadItems() {
  // DATA_FILE=data.json 처럼 이미 만들어진 data.json 스냅숏으로 로컬 미리보기
  // (Notion 비밀키 없이 실제 도안·이미지로 /p/<id> 페이지를 확인할 때)
  if (process.env.DATA_FILE) {
    const raw = await fs.readFile(path.resolve(process.env.DATA_FILE), 'utf8');
    console.log(`[build] DATA_FILE=${process.env.DATA_FILE} 사용`);
    return JSON.parse(raw).items.map(normalizeItem);
  }
  if (process.env.NOTION_TOKEN && process.env.NOTION_DB_ID) {
    const { fetchPublishedItems } = await import('./notion.mjs');
    return fetchPublishedItems();
  }
  console.warn('[build] NOTION_TOKEN 없음 → data.sample.json 폴백');
  const raw = await fs.readFile(path.join(ROOT, 'data.sample.json'), 'utf8');
  return JSON.parse(raw).items.map(normalizeItem);
}

// 로컬 정적 자산(/cards/...)인지 — Cloudinary 변환을 거치면 안 된다.
const isLocalAsset = (s) => typeof s === 'string' && /^\//.test(s);
const absUrl = (s) => (isLocalAsset(s) ? `${SITE}${s}` : s);

// 레포에 고정된 '카드·편지지' 데이터(노션과 무관). 파일이 없으면 조용히 넘긴다.
async function loadStaticCards() {
  const file = path.join(ROOT, 'data', 'cards.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const list = JSON.parse(raw).items.map(normalizeItem);
    console.log(`[build] 카드·편지지 정적 데이터 ${list.length}건 (data/cards.json)`);
    return list;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[build] data/cards.json 읽기 실패 —', e.message);
    return [];
  }
}

const copyOf = (it) => MAIN_COPY[it.mainCategory] || MAIN_COPY[MAIN.COLOR];

// item에 Cloudinary URL과 공유문구를 입혀 사이트가 바로 쓰게 만듦
function enrich(it) {
  // 카드·편지지처럼 파일 경로(/cards/...)를 그대로 쓰는 항목은 변환 없이 통과시킨다.
  if (it.static) {
    return {
      ...it,
      cloud: CLOUD,
      categoryLabel: categoryLabel(it),
      url: `${SITE}/p/${it.id}`,
      // og:image 만 절대 주소여야 카카오톡·검색엔진이 읽는다. 화면용 경로는 사이트 내 상대 경로로 둔다.
      og: absUrl(it.og),
      thumb: it.thumb || it.cover,
      cover: it.cover,
      promo: it.promo || it.cover,
      pages: it.pages.map((pg, i) => ({ ...pg, n: Number(pg.n) || i + 1 })),
      shareText: buildShareText(it, SITE),
    };
  }
  const o = { cloud: CLOUD, title: it.title };
  const cover = CL.toPublicId(it.cover); // 샘플의 전체 URL도 정규화
  // 시리즈는 split-upload 가 만들어 둔 10칸 그리드(<id>/<id>-grid)를 공유카드로 쓰고,
  // '단일' 워크시트는 그리드 합성본이 없으니 대표 이미지를 그대로 쓴다.
  const shareVisual = it.type === 'single' ? cover : `uncledison/coloring/${it.id}/${it.id}-grid`;
  const visual = shareVisual || cover;
  // 워터마크 정책: 색칠도안만 우하단 검정 워터마크 유지.
  // 두뇌놀이·스티커판 원본은 이미 하단에 사이트 문구가 들어가 있어 다운로드·인쇄·공유
  // 변환에서 워터마크 오버레이를 빼고 깨끗한 고해상도 이미지를 쓴다.
  const watermark = it.mainCategory === MAIN.COLOR;

  return {
    ...it,
    mainCategory: it.mainCategory,
    categoryLabel: categoryLabel(it),
    cover,
    url: `${SITE}/p/${it.id}`,
    thumb: CL.thumb(cover, o),
    og: CL.ogImage(visual, o),
    promo: CL.socialShare(visual, { cloud: CLOUD, watermark }),
    pages: it.pages.map((pg) => {
      const publicId = CL.toPublicId(pg.publicId);
      return {
        ...pg,
        publicId,
        preview: CL.preview(publicId, { cloud: CLOUD }),
        // /p/<id> 그리드용 작은 미리보기 — 8~10장을 한 화면에 늘어놓아도 모바일 데이터를 아낀다
        small: CL.preview(publicId, { cloud: CLOUD, w: 560 }),
        print: CL.printable(publicId, { cloud: CLOUD, watermark }),
        social: CL.socialShare(publicId, { cloud: CLOUD, watermark }),
        download: CL.download(publicId, {
          cloud: CLOUD,
          filename: `${it.id}-${String(pg.n).padStart(2, '0')}`,
          watermark,
        }),
      };
    }),
    shareText: buildShareText(it, SITE),
  };
}

// 네이버 블로그/카페 붙여넣기용 정적 페이지. 본문 영역을 드래그+복사하면
// 이미지(실제 <img>)와 문단 서식이 그대로 살아서 붙여넣기 된다.
// 다운로드 링크는 일부러 밋밋한 텍스트 링크로 둬서, 버튼 대신 "그냥 URL"처럼
// 보이게 해 네이버가 별도로 링크 미리보기 카드를 만들 여지를 준다.
function promoCopyPage(it, { text, label }) {
  const copy = copyOf(it);
  const paragraphs = (text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^https?:\/\/\S+$/.test(p));

  const bodyHtml = paragraphs
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n    <p class="spacer">&nbsp;</p>\n    <p class="spacer">&nbsp;</p>\n\n    ');

  const pagesLine =
    it.type === 'series'
      ? `${copy.pageNoun} ${it.pageCount}장 무료로 받으러 가기`
      : `${copy.pageNoun} 무료로 받으러 가기`;

  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(it.title)} — ${label} 복사용</title>
<meta name="robots" content="noindex">
<style>
  :root{--paper:#fff;--ink:#3d2b1f;--ink-2:#6b5c4d;--coral:#c8442a;--border:#e5e5e5}
  @media (prefers-color-scheme: dark){
    :root{--paper:#1c1917;--ink:#f2e9dd;--ink-2:#c9baa8;--coral:#e8734f;--border:#3a3532}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
  .toolbar{position:sticky;top:0;z-index:10;background:var(--paper);border-bottom:1px dashed var(--border);padding:14px 20px;font-size:13px;color:var(--ink-2);user-select:none}
  .toolbar b{color:var(--coral);font-weight:700}
  .wrap{max-width:640px;margin:0 auto;padding:48px 24px 80px;background:var(--paper)}
  .kicker{font-size:12px;letter-spacing:.08em;color:var(--coral);font-weight:700;margin-bottom:10px}
  h1{font-family:'Nanum Myeongjo','Batang',serif;font-size:clamp(28px,5vw,38px);line-height:1.3;margin:0 0 28px}
  .cover{width:100%;border-radius:14px;border:1px solid var(--border);display:block;margin-bottom:28px}
  .body p{font-size:17px;color:var(--ink);margin:0;max-width:60ch}
  .spacer{height:1px}
  .cta{margin-top:14px;padding-top:28px;border-top:1px solid var(--border)}
  .cta p{font-size:17px;margin:0 0 8px}
  .cta a{color:var(--coral);text-decoration:underline}
</style>
</head><body>
<div class="toolbar">📋 아래 글 영역(제목부터 링크까지)만 드래그해서 선택 → <b>Ctrl+C</b> 복사 → 네이버 에디터에 붙여넣으세요. (이 안내문은 선택돼도 복사되지 않아요)</div>
<div class="wrap">
  <div class="kicker">${esc(categoryLabel(it) || copy.ogLabel)}</div>
  <h1>${esc(it.title)}</h1>
  <img class="cover" alt="${esc(it.title)} ${esc(copy.noun)} 미리보기" src="${esc(it.promo)}">
  <div class="body">
    ${bodyHtml}
  </div>
  <div class="cta">
    <p>👉 ${esc(pagesLine)}</p>
    <p><a href="${esc(it.url)}">${esc(it.url)}</a></p>
  </div>
</div>
</body></html>`;
}

// 카드·편지지처럼 노션 글감(blogText/cafeText)이 없는 항목은 소개문으로 본문을 채운다.
function promoFallbackText(it) {
  if (!it.cardSet) return '';
  const n = (it.pages || []).length;
  if (n < 2) {
    return [
      it.desc,
      `A4 한 장에 앞면 MERRY CHRISTMAS · 뒷면 HAPPY NEW YEAR가 함께 들어 있어요. 실선을 따라 오린 뒤 가운데 붉은 점선을 뒤로 접어 위쪽 원을 넘기면 앞·뒷면이 바뀌고, 완성 지름은 ${it.sizes || '116mm'} 입니다.`,
    ].join('\n\n');
  }
  const pages = (it.pages || []).map((pg) => `${pg.n}. ${pg.name}`).join(' · ');
  return [
    it.desc,
    `한 부에 카드·카드 봉투·편지지·편지 봉투 네 장이 들어 있어요(${pages}). A4로 인쇄해 접고 붙이면 완성되고, 완성 크기는 ${it.sizes || ''} 입니다.`,
  ].join('\n\n');
}

const blogPage = (it) => promoCopyPage(it, { text: it.blogText || promoFallbackText(it), label: '블로그' });
const cafePage = (it) => promoCopyPage(it, { text: it.cafeText || promoFallbackText(it), label: '카페' });

// 검색엔진 등록·크롤링용 sitemap.xml / robots.txt
function sitemapXml(items) {
  const latest = items.map((it) => it.updated).filter(Boolean).sort().pop();
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', lastmod: latest },
    ...items.map((it) => ({ loc: it.url, priority: '0.8', lastmod: it.updated })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${esc(u.loc)}</loc>` +
        (u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : '') +
        `<priority>${u.priority}</priority></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

// 존재하지 않는 주소용 404 페이지.
// Cloudflare Pages는 public/404.html이 있으면 없는 주소에 이 파일을 404 상태로 서빙한다.
// (없으면 index.html을 200으로 돌려줘 soft 404가 된다 — Vercel에서는 404였다.)
function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>페이지를 찾을 수 없습니다 — color.uncle</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f3;color:#3d2b1f;
       font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;text-align:center;padding:24px}
  h1{font-size:1.4rem;margin:0 0 .75rem}
  p{margin:0 0 1.5rem;color:#8a7860;line-height:1.6}
  a{display:inline-block;padding:.75rem 1.5rem;border-radius:999px;background:#c8442a;color:#fff;
    text-decoration:none;font-weight:700}
</style>
</head>
<body>
  <main>
    <h1>앗, 이 페이지를 찾을 수 없어요</h1>
    <p>주소가 바뀌었거나 잘못 입력된 것 같아요.<br>아래 버튼으로 홈에서 도안을 골라 보세요.</p>
    <a href="/">무료 도안 보러 가기</a>
  </main>
</body>
</html>
`;
}

// 노션에서 새로 공개된(아직 핀터레스트 미업로드) 항목만 골라 자동으로 핀 생성
async function publishNewItemsToPinterest(items) {
  if (!process.env.PINTEREST_ACCESS_TOKEN) return;
  const { publishItemToPinterest } = await import('./pinterest.mjs');
  const { markPinterestDone } = await import('./notion.mjs');

  const targets = items.filter((it) => it.pageId && !it.pinterestDone);
  for (const it of targets) {
    const results = await publishItemToPinterest(it);
    const ok = results.filter((r) => r.ok).length;
    console.log(`[pinterest] ${it.id}: ${ok}/${results.length}장 업로드`);
    if (ok > 0) await markPinterestDone(it.pageId);
  }
}

async function main() {
  const items = [...(await loadItems()), ...(await loadStaticCards())].map((it) => normalizeItem(it)).map(enrich);

  await publishNewItemsToPinterest(items);

  await fs.mkdir(path.join(OUT, 'p'), { recursive: true });

  // 카드·편지지 정적 자산(미리보기·인쇄용 이미지·A4 PDF) — 레포 assets/cards → public/cards
  const CARDS_SRC = path.join(ROOT, 'assets', 'cards');
  try {
    await fs.cp(CARDS_SRC, path.join(OUT, 'cards'), { recursive: true });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  // data.json
  await fs.writeFile(
    path.join(OUT, 'data.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), cloud: CLOUD, site: SITE, items }, null, 2)
  );

  // index.html 및 정적 페이지 복사 (소스는 레포 루트, 출력은 public/)
  await fs.copyFile(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
  await fs.copyFile(path.join(ROOT, 'copyright.html'), path.join(OUT, 'copyright.html'));
  await fs.copyFile(path.join(ROOT, 'privacy.html'), path.join(OUT, 'privacy.html'));
  await fs.copyFile(path.join(ROOT, 'bgm.mp3'), path.join(OUT, 'bgm.mp3'));
  await fs.copyFile(path.join(ROOT, 'coffee-cup.png'), path.join(OUT, 'coffee-cup.png'));
  await fs.copyFile(path.join(ROOT, 'coffee-qr.png'), path.join(OUT, 'coffee-qr.png'));
  await fs.copyFile(path.join(ROOT, 'favicon-16x16.png'), path.join(OUT, 'favicon-16x16.png'));
  await fs.copyFile(path.join(ROOT, 'favicon-32x32.png'), path.join(OUT, 'favicon-32x32.png'));
  await fs.copyFile(path.join(ROOT, 'apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png'));
  await fs.copyFile(path.join(ROOT, 'icon-192.png'), path.join(OUT, 'icon-192.png'));
  await fs.copyFile(path.join(ROOT, 'icon-512.png'), path.join(OUT, 'icon-512.png'));
  await fs.copyFile(path.join(ROOT, 'site.webmanifest'), path.join(OUT, 'site.webmanifest'));
  await fs.copyFile(path.join(ROOT, 'sw.js'), path.join(OUT, 'sw.js'));

  // 4대분류 아이콘(투명 WebP) — 상단 네비·히어로·탭·섹션 제목에서 사용
  const ICON_SRC = path.join(ROOT, 'assets', 'icons');
  await fs.mkdir(path.join(OUT, 'icons'), { recursive: true });
  for (const file of await fs.readdir(ICON_SRC)) {
    if (!/\.(webp|png|svg)$/i.test(file)) continue;
    await fs.copyFile(path.join(ICON_SRC, file), path.join(OUT, 'icons', file));
  }

  // OG 페이지 + 블로그/카페 복사용 페이지 (OG 페이지에는 SEO 메타·JSON-LD·내부 링크를 입힌다)
  await fs.mkdir(path.join(OUT, 'blog'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'cafe'), { recursive: true });
  for (const it of items) {
    const seo = buildSeo(it, { site: SITE });
    await fs.writeFile(path.join(OUT, 'p', `${it.id}.html`), richPage(it, { seo, related: relatedFor(it, items), site: SITE }));
    await fs.writeFile(path.join(OUT, 'blog', `${it.id}.html`), blogPage(it));
    await fs.writeFile(path.join(OUT, 'cafe', `${it.id}.html`), cafePage(it));
  }

  // IndexNow 키 파일 — https://color.uncledison.com/<key>.txt 로 서빙되어 소유 확인에 쓰인다
  await fs.writeFile(path.join(OUT, keyFileName()), INDEXNOW_KEY, 'utf8');

  // sitemap.xml / robots.txt
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemapXml(items));
  await fs.writeFile(path.join(OUT, 'robots.txt'), robotsTxt());
  await fs.writeFile(path.join(OUT, '404.html'), notFoundHtml()); // Cloudflare Pages가 없는 주소에 404 상태로 서빙

  // 대분류별 개수 로그(노션 '대분류' 매핑이 의도대로 됐는지 한눈에 확인)
  const counts = Object.fromEntries([...Object.values(MAIN), '미분류'].map((m) => [m, 0]));
  for (const it of items) counts[it.mainCategory] = (counts[it.mainCategory] || 0) + 1;
  const breakdown = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${m} ${n}`)
    .join(' · ');
  console.log(`[build] ${items.length}개 항목 (${breakdown}) · cloud=${CLOUD} · site=${SITE}`);

  // IndexNow 자동 통지 — 프로덕션 빌드(Cloudflare Pages)에서만, 실패해도 빌드는 성공으로 끝난다
  const indexUrls = [`${SITE}/`, ...items.map((it) => it.url)];
  if (shouldPingIndexNow()) {
    await pingIndexNow({ site: SITE, urls: indexUrls, log: console.log });
  } else {
    console.log(`[indexnow] 전송 건너뜀 — 로컬/테스트 빌드 (키 파일 ${keyFileName()} 은 생성됨)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
