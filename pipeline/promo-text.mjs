// pipeline/promo-text.mjs
// 이미 공개된 시리즈 하나를 골라, 네이버 블로그(긴 글)/카페(짧은 홍보글) 초안과
// 홍보용 썸네일(그리드+워터마크) URL을 함께 만들어 콘솔에 출력한다.
//
// 사용법: node pipeline/promo-text.mjs <슬러그>
//   예: node pipeline/promo-text.mjs tiger-brother

process.loadEnvFile(new URL('../.env', import.meta.url));
process.env.NOTION_DB_ID = process.env.NOTION_DB_ID || '99d2f23293f64c85857ba7e884dd05aa';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPublishedItems } from './notion.mjs';
import * as CL from './cloudinary.mjs';

const CLOUD = process.env.CLOUDINARY_CLOUD || 'dhfobwnfc';
const SITE = (process.env.SITE_URL || 'https://color.uncledison.com').replace(/\/$/, '');

export function buildBlogText(it, url, promoUrl) {
  const storyLines = it.pages.map((p, i) => `${i + 1}. ${p.story}`).join('\n');
  const allTags = [...new Set([...(it.tags || []), '무료색칠도안', '전래동화', '색칠공부'])];
  const tagLine = allTags.map((t) => `#${t}`).join(' ');
  return `${it.title} 무료 색칠도안 - ${it.category} 이야기

(대표 이미지 첨부 — 아래 URL을 다운받아 올려주세요)
${promoUrl}

${it.desc}

--- 이야기 흐름 ---
${storyLines}

--- 인쇄 안내 ---
이 도안은 총 ${it.pageCount}장으로 구성되어 있어요. A4 용지에 인쇄하면 바로 색칠할 수 있고,
고화질 원본 10장은 아래 링크에서 전부 무료로 받으실 수 있습니다.

👉 ${url}

${tagLine}`;
}

export function buildCafeText(it, url, promoUrl) {
  return `🎨 ${it.title} (색칠도안 ${it.pageCount}장)

${it.desc}
무료로 다운받아 색칠해보세요!

👉 ${url}

(대표 이미지 첨부 — 아래 URL을 다운받아 올려주세요)
${promoUrl}`;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('사용법: node pipeline/promo-text.mjs <슬러그>');
    process.exit(1);
  }

  const items = await fetchPublishedItems();
  const it = items.find((i) => i.id === slug);
  if (!it) {
    console.error(`공개된 항목 중 슬러그="${slug}"를 찾을 수 없습니다.`);
    process.exit(1);
  }

  const url = `${SITE}/p/${it.id}`;
  const promoUrl = CL.socialShare(`uncledison/coloring/${it.id}/${it.id}-grid`, { cloud: CLOUD });

  console.log('='.repeat(60));
  console.log('네이버 블로그용 (긴 글)');
  console.log('='.repeat(60));
  console.log(buildBlogText(it, url, promoUrl));
  console.log('\n' + '='.repeat(60));
  console.log('네이버 카페용 (짧은 홍보글)');
  console.log('='.repeat(60));
  console.log(buildCafeText(it, url, promoUrl));
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');
if (isDirectRun) {
  main().catch((e) => {
    console.error('[error]', e.message);
    process.exit(1);
  });
}
