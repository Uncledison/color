// pipeline/build.mjs  —  Vercel 빌드에서 실행 (vercel.json의 buildCommand)
// 1) Notion(공개=true) → 표준 items  2) Cloudinary URL 주입  3) public/data.json
// 4) 도안별 OG 정적페이지 public/p/<id>.html  5) index.html을 public/로 복사
//
// NOTION_TOKEN 이 없으면 data.sample.json 으로 폴백(로컬 미리보기용).
//
// 3대분류(색칠도안 · 두뇌놀이 · 생활·학습판) 개편:
// - item.mainCategory / item.audience 를 항상 채운다(노션에 컬럼이 없어도 안전).
// - '단일' 유형은 시리즈용 10칸 그리드(-grid) 이미지가 없으므로 og/promo 를 대표 이미지(cover)로 만든다.
// - 공유문구·OG 문구를 대분류에 맞게 분기한다(색칠도안은 기존 문구 그대로).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CL from './cloudinary.mjs';
import { MAIN, MAIN_COPY, buildShareText, categoryLabel, normalizeItem } from './categories.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');

const CLOUD = process.env.CLOUDINARY_CLOUD || 'dhfobwnfc';
const SITE = (process.env.SITE_URL || 'https://color.uncledison.com').replace(/\/$/, '');

async function loadItems() {
  if (process.env.NOTION_TOKEN && process.env.NOTION_DB_ID) {
    const { fetchPublishedItems } = await import('./notion.mjs');
    return fetchPublishedItems();
  }
  console.warn('[build] NOTION_TOKEN 없음 → data.sample.json 폴백');
  const raw = await fs.readFile(path.join(ROOT, 'data.sample.json'), 'utf8');
  return JSON.parse(raw).items.map(normalizeItem);
}

const copyOf = (it) => MAIN_COPY[it.mainCategory] || MAIN_COPY[MAIN.COLOR];

// item에 Cloudinary URL과 공유문구를 입혀 사이트가 바로 쓰게 만듦
function enrich(it) {
  const o = { cloud: CLOUD, title: it.title };
  const cover = CL.toPublicId(it.cover); // 샘플의 전체 URL도 정규화
  // 시리즈는 split-upload 가 만들어 둔 10칸 그리드(<id>/<id>-grid)를 공유카드로 쓰고,
  // '단일' 워크시트는 그리드 합성본이 없으니 대표 이미지를 그대로 쓴다.
  const shareVisual = it.type === 'single' ? cover : `uncledison/coloring/${it.id}/${it.id}-grid`;
  const visual = shareVisual || cover;

  return {
    ...it,
    mainCategory: it.mainCategory,
    categoryLabel: categoryLabel(it),
    cover,
    url: `${SITE}/p/${it.id}`,
    thumb: CL.thumb(cover, o),
    og: CL.ogImage(visual, o),
    promo: CL.socialShare(visual, { cloud: CLOUD }),
    pages: it.pages.map((pg) => {
      const publicId = CL.toPublicId(pg.publicId);
      return {
        ...pg,
        publicId,
        preview: CL.preview(publicId, { cloud: CLOUD }),
        print: CL.printable(publicId, { cloud: CLOUD }),
        social: CL.socialShare(publicId, { cloud: CLOUD }),
        download: CL.download(publicId, {
          cloud: CLOUD,
          filename: `${it.id}-${String(pg.n).padStart(2, '0')}`,
        }),
      };
    }),
    shareText: buildShareText(it, SITE),
  };
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

const blogPage = (it) => promoCopyPage(it, { text: it.blogText, label: '블로그' });
const cafePage = (it) => promoCopyPage(it, { text: it.cafeText, label: '카페' });

// 인쇄 버튼: 현재 창에서 iframe 으로 인쇄 전용 문서를 띄운다(팝업 차단 없음).
const PRINT_JS = `
function printSheet(src){
  var f=document.getElementById('printFrame');
  if(!f){f=document.createElement('iframe');f.id='printFrame';f.setAttribute('aria-hidden','true');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f);}
  var d=f.contentWindow.document;
  d.open();
  d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}img{display:block;width:210mm;height:auto}</style></head><body><img src="'+src+'" onload="setTimeout(function(){window.focus();window.print()},200)"></body></html>');
  d.close();
}
`;

// 크롤러가 읽는 정적 OG 페이지 + 사람에겐 도안으로 진입시키는 가벼운 랜딩.
// '단일' 워크시트(미로찾기·선잇기·점잇기·칭찬스티커판 등)는 A4 한 장을 크게 보여주고
// 인쇄/다운로드 버튼을 바로 누를 수 있게 만든다.
function ogPage(it) {
  const copy = copyOf(it);
  const desc = it.desc || `${it.title} ${copy.ogLabel} 다운로드`;
  const kicker = categoryLabel(it) || copy.ogLabel;
  const first = it.pages[0] || {};

  if (it.type === 'single') {
    return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(it.title)} — color.uncle ${esc(copy.ogLabel)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(it.title)}">
<meta property="og:description" content="${esc(desc)} · ${esc(copy.cta)}">
<meta property="og:image" content="${esc(it.og)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(it.url)}">
<meta property="og:site_name" content="color.uncle">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(it.url)}">
<style>
  :root{--ink:#3d2b1f;--ink-3:#8a7860;--coral:#f2a72e;--warm:#fff7e6;--border:rgba(61,43,31,.12)}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#faf7f3;color:var(--ink);text-align:center}
  .wrap{max-width:640px;margin:0 auto;padding:28px 18px 56px}
  .kicker{font-size:12px;font-weight:700;letter-spacing:.06em;color:#c8442a;margin-bottom:6px}
  h1{font-size:22px;font-weight:700;margin:0 0 16px;line-height:1.35}
  /* A4 한 장 비율(210:297) 그대로 크게 */
  .a4{aspect-ratio:210/297;width:100%;max-width:520px;margin:0 auto;background:#fff;border:1px solid var(--border);
      border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.12);overflow:hidden;display:flex;align-items:center;justify-content:center}
  .a4 img{width:100%;height:100%;object-fit:contain;display:block}
  .acts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:20px 0 10px}
  .btn{height:52px;padding:0 26px;border-radius:100px;font-size:16px;font-weight:700;display:inline-flex;align-items:center;gap:7px;
       text-decoration:none;border:none;cursor:pointer;font-family:inherit}
  .btn-print{background:var(--coral);color:#fff}
  .btn-dl{background:var(--ink);color:#fff}
  .btn:active{transform:translateY(1px)}
  .hint{font-size:12.5px;color:var(--ink-3);margin:0 0 22px;line-height:1.6}
  .to-site{display:inline-block;font-size:14px;font-weight:600;color:#c8442a;text-decoration:underline;padding:8px}
  /* 이 페이지에서 바로 Ctrl+P 해도 A4 그림만 깔끔하게 나오도록 */
  @media print{
    .kicker,h1,.acts,.hint,.to-site{display:none}
    body{background:#fff}
    .wrap{padding:0;max-width:none}
    .a4{max-width:none;width:100%;border:none;border-radius:0;box-shadow:none}
  }
</style>
</head><body>
<div class="wrap">
  <div class="kicker">${esc(kicker)}</div>
  <h1>${esc(it.title)}</h1>
  <div class="a4"><img src="${esc(first.preview || it.thumb)}" alt="${esc(it.title)} ${esc(copy.noun)} 미리보기"></div>
  <div class="acts">
    <button class="btn btn-print" onclick="printSheet('${esc(first.print || first.preview || '')}')">🖨 A4로 인쇄</button>
    <a class="btn btn-dl" href="${esc(first.download || '#')}" rel="noopener">⬇ 다운로드</a>
  </div>
  <p class="hint">인쇄 대화상자에서 용지 <b>A4 · 세로</b>, 여백 <b>없음</b>을 고르면 한 장에 꼭 맞게 나옵니다.</p>
  <p class="hint">${esc(desc)}</p>
  <a class="to-site" href="/#${esc(it.id)}">사이트에서 크게 보기 →</a>
</div>
<script>${PRINT_JS}</script>
</body></html>`;
  }

  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(it.title)} — color.uncle ${esc(copy.ogLabel)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(it.title)}">
<meta property="og:description" content="${esc(desc)} · 다운받아 활용해보세요!">
<meta property="og:image" content="${esc(it.og)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(it.url)}">
<meta property="og:site_name" content="color.uncle">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(it.url)}">
</head><body style="margin:0;font-family:'Noto Sans KR',sans-serif;background:#faf7f3;text-align:center">
<div style="max-width:560px;margin:0 auto;padding:40px 20px">
  <img src="${esc(it.thumb)}" alt="${esc(it.title)}" style="max-width:320px;width:100%;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.12)">
  <h1 style="font-size:22px;margin:24px 0 8px">${esc(it.title)}</h1>
  <p style="color:#7a7269;margin:0 0 24px">${esc(desc)}</p>
  <a href="/#${esc(it.id)}" style="display:inline-block;background:#c8442a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none">${esc(copy.noun)} 보러가기 →</a>
</div>
</body></html>`;
}

// 검색엔진 등록·크롤링용 sitemap.xml / robots.txt
function sitemapXml(items) {
  const urls = [
    { loc: `${SITE}/`, priority: '1.0' },
    ...items.map((it) => ({ loc: it.url, priority: '0.8' })),
  ];
  const body = urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc><priority>${u.priority}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
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
  const items = (await loadItems()).map(enrich);

  await publishNewItemsToPinterest(items);

  await fs.mkdir(path.join(OUT, 'p'), { recursive: true });

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

  // OG 페이지 + 블로그/카페 복사용 페이지
  await fs.mkdir(path.join(OUT, 'blog'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'cafe'), { recursive: true });
  for (const it of items) {
    await fs.writeFile(path.join(OUT, 'p', `${it.id}.html`), ogPage(it));
    await fs.writeFile(path.join(OUT, 'blog', `${it.id}.html`), blogPage(it));
    await fs.writeFile(path.join(OUT, 'cafe', `${it.id}.html`), cafePage(it));
  }

  // sitemap.xml / robots.txt
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemapXml(items));
  await fs.writeFile(path.join(OUT, 'robots.txt'), robotsTxt());

  // 대분류별 개수 로그(노션 '대분류' 매핑이 의도대로 됐는지 한눈에 확인)
  const counts = Object.fromEntries([...Object.values(MAIN), '미분류'].map((m) => [m, 0]));
  for (const it of items) counts[it.mainCategory] = (counts[it.mainCategory] || 0) + 1;
  const breakdown = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${m} ${n}`)
    .join(' · ');
  console.log(`[build] ${items.length}개 항목 (${breakdown}) · cloud=${CLOUD} · site=${SITE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
