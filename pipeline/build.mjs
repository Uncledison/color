// pipeline/build.mjs  —  Vercel 빌드에서 실행 (vercel.json의 buildCommand)
// 1) Notion(공개=true) → 표준 items  2) Cloudinary URL 주입  3) public/data.json
// 4) 도안별 OG 정적페이지 public/p/<id>.html  5) index.html을 public/로 복사
//
// NOTION_TOKEN 이 없으면 data.sample.json 으로 폴백(로컬 미리보기용).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CL from './cloudinary.mjs';

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
  return JSON.parse(raw).items;
}

// item에 Cloudinary URL과 공유문구를 입혀 사이트가 바로 쓰게 만듦
function enrich(it) {
  const o = { cloud: CLOUD, title: it.title };
  const cover = CL.toPublicId(it.cover); // 샘플의 전체 URL도 정규화
  return {
    ...it,
    cover,
    url: `${SITE}/p/${it.id}`,
    thumb: CL.thumb(cover, o),
    og: CL.ogImage(cover, o),
    pages: it.pages.map((pg) => {
      const publicId = CL.toPublicId(pg.publicId);
      return {
        ...pg,
        publicId,
        preview: CL.preview(publicId, { cloud: CLOUD }),
        download: CL.download(publicId, {
          cloud: CLOUD,
          filename: `${it.id}-${String(pg.n).padStart(2, '0')}`,
        }),
      };
    }),
    shareText:
      `🎨 ${it.title}` +
      (it.type === 'series' ? ` (색칠도안 ${it.pageCount}장)` : ' (색칠도안)') +
      `\n\n${it.desc}\n무료로 다운받아 색칠해보세요!\n\n👉 ${SITE}/p/${it.id}`,
  };
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 크롤러가 읽는 정적 OG 페이지 + 사람에겐 도안으로 진입시키는 가벼운 랜딩
function ogPage(it) {
  const desc = it.desc || `${it.title} 무료 색칠도안 다운로드`;
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(it.title)} — color.uncle 무료 색칠도안</title>
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
  <a href="/#${esc(it.id)}" style="display:inline-block;background:#c8442a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none">색칠도안 보러가기 →</a>
</div>
<script>/* 사람이 직접 들어오면 앱으로 자동 이동(크롤러는 JS 미실행이라 OG 유지) */
setTimeout(function(){location.replace('/#${esc(it.id)}')}, 1200);</script>
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

async function main() {
  const items = (await loadItems()).map(enrich);

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

  // OG 페이지
  for (const it of items) {
    await fs.writeFile(path.join(OUT, 'p', `${it.id}.html`), ogPage(it));
  }

  // sitemap.xml / robots.txt
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemapXml(items));
  await fs.writeFile(path.join(OUT, 'robots.txt'), robotsTxt());

  console.log(`[build] ${items.length}개 도안 · cloud=${CLOUD} · site=${SITE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
