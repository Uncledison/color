// pipeline/split-upload.mjs
// 시리즈 원본 시안(5열×2행=10칸 그리드) 1장 → 칸별 테두리 제거 크롭 → Cloudinary 업로드
// → (메타파일이 있으면) Notion에 미공개 행까지 자동 생성.
//
// 사용법 A - 메타 없이 크롭/업로드만:
//   node pipeline/split-upload.mjs <이미지경로> <슬러그> [--margin=40]
//
// 사용법 B - 메타파일로 Notion 행까지 자동 생성 (슬러그는 메타파일의 ID를 사용, 인자 불필요):
//   node pipeline/split-upload.mjs <이미지경로> --meta=<메타파일경로> [--margin=40]
//   또는 이미지와 같은 폴더에 "<이미지 파일명>.meta.txt"를 같이 두면 자동으로 인식함
//   (예: inbox/konggi.png + inbox/konggi.meta.txt)
//
// 사용법 C - 이미지 재크롭/재업로드 없이, 메타파일 내용만 기존 Notion 행에 반영:
//   node pipeline/split-upload.mjs <이미지경로> --update
//   (사이드카 메타파일의 ID로 기존 행을 찾아 제목/유형/카테고리/태그/난이도/소개/스토리만 갱신.
//    이미지/공개 값은 건드리지 않음. 이미 있는 이미지는 그대로 두고 텍스트만 고칠 때 사용)
//
// 사용법 D - 배치 모드(split-upload.bat에 여러 이미지를 한 번에 드래그):
//   node pipeline/split-upload.mjs <이미지경로> --skip-if-no-meta
//   (사이드카 .meta.txt가 없으면 에러 없이 건너뜀. bat이 각 파일마다 이 옵션으로 호출)
//
// 사이드카 메타파일 이름 매칭: "tiger.jpg"→"tiger.meta.txt" 뿐 아니라
// "tiger.meta.jpg"→"tiger.meta.txt" 도 동일하게 인식됨(이미지 파일명 자체에 .meta를 붙여도 무방).
//
// 원본마다 그리드 칸의 실제 크기/위치가 조금씩 달라서 칸마다 테두리를 자동 인식하는 대신,
// 칸을 5x2로 균등 분할한 뒤 안쪽으로 --margin 픽셀만큼 통일된 두께로 인셋 크롭해서
// 검은 테두리 선이 결과물에 남지 않게 한다. 그리드 편차가 크면 --margin 값을 올려서 재실행.
//
// 10칸 원본 이미지 자체도 Cloudinary에 올려두고, 네이버 블로그/카페 홍보용으로
// 축소(가로 600px)+워터마크된 URL을 출력한다(원본 그대로 유출되지 않도록).
//
// DPI 자동 확대: 원본이 저해상도(기본 72dpi 가정)면 물리 크기(인치)를 유지한 채
// 목표 dpi(기본 150)로 리샘플 확대한 뒤 자르고 업로드한다(포토샵 수동 작업 대체).
// 파일에 이미 더 높은 density가 박혀있으면 자동으로 생략됨.
// 배율 조정: --source-dpi=72 --target-dpi=150 (기본값과 같으면 생략 가능)

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { Client as NotionClient } from '@notionhq/client';
import * as CL from './cloudinary.mjs';

process.loadEnvFile(new URL('../.env', import.meta.url));

const COLS = 5;
const ROWS = 2;
const SOURCE_DPI_DEFAULT = 72;
const TARGET_DPI_DEFAULT = 150;
const NOTION_DB_ID = process.env.NOTION_DB_ID || '99d2f23293f64c85857ba7e884dd05aa';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD || 'dhfobwnfc',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── 메타파일 파싱 ──
// 형식: "키: 값" 줄들 + 마지막 "스토리:" 다음부터는 줄바꿈으로 여러 줄(페이지 순서와 동일)
const META_KEYS = ['제목', 'ID', '유형', '카테고리', '태그', '난이도', '소개', '스토리'];
const KEY_LINE = new RegExp(`^(${META_KEYS.join('|')})\\s*:\\s*(.*)$`);

function parseMeta(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(KEY_LINE);
    if (!m) { i++; continue; }
    const [, key, rest] = m;
    if (key === '스토리') {
      const storyLines = [];
      if (rest.trim()) storyLines.push(rest.trim());
      i++;
      while (i < lines.length) {
        if (lines[i].match(KEY_LINE)) break;
        if (lines[i].trim()) storyLines.push(lines[i].trim());
        i++;
      }
      meta['스토리'] = storyLines;
      continue;
    }
    meta[key] = rest.trim();
    i++;
  }
  return meta;
}

function loadMeta(metaPath) {
  const text = fs.readFileSync(metaPath, 'utf8');
  const meta = parseMeta(text);
  if (!meta['제목']) throw new Error(`메타파일에 "제목"이 없습니다: ${metaPath}`);
  if (!meta['ID']) throw new Error(`메타파일에 "ID"가 없습니다: ${metaPath}`);
  if (!/^[a-z0-9-]+$/i.test(meta['ID'])) {
    throw new Error(`메타파일의 ID는 영문/숫자/하이픈만 가능합니다: "${meta['ID']}"`);
  }
  return meta;
}

function sidecarMetaPath(imagePath) {
  const dir = path.dirname(imagePath);
  let base = path.basename(imagePath, path.extname(imagePath));
  base = base.replace(/\.meta$/i, ''); // tiger.meta.jpg 도 tiger.jpg 와 동일하게 tiger.meta.txt 를 찾음
  const p = path.join(dir, `${base}.meta.txt`);
  return fs.existsSync(p) ? p : null;
}

function parseArgs(argv) {
  const [imagePath, maybeSlug, ...rest] = argv;
  if (!imagePath) {
    console.error('사용법: node pipeline/split-upload.mjs <이미지경로> <슬러그|--meta=파일> [--margin=40]');
    process.exit(1);
  }

  let margin = 40;
  let metaPath = null;
  let slug = null;
  let updateOnly = false;
  let skipIfNoMeta = false;
  let sourceDpi = SOURCE_DPI_DEFAULT;
  let targetDpi = TARGET_DPI_DEFAULT;

  const flagArgs = [maybeSlug, ...rest].filter(Boolean);
  for (const a of flagArgs) {
    if (a === '--update') { updateOnly = true; continue; }
    if (a === '--skip-if-no-meta') { skipIfNoMeta = true; continue; }
    const marginM = a.match(/^--margin=(\d+)$/);
    if (marginM) { margin = Number(marginM[1]); continue; }
    const metaM = a.match(/^--meta=(.+)$/);
    if (metaM) { metaPath = metaM[1]; continue; }
    const srcDpiM = a.match(/^--source-dpi=(\d+)$/);
    if (srcDpiM) { sourceDpi = Number(srcDpiM[1]); continue; }
    const tgtDpiM = a.match(/^--target-dpi=(\d+)$/);
    if (tgtDpiM) { targetDpi = Number(tgtDpiM[1]); continue; }
    if (!a.startsWith('--')) slug = a; // 위치 인자 = 슬러그
  }

  if (!metaPath) metaPath = sidecarMetaPath(imagePath); // 자동 감지

  let meta = null;
  if (metaPath) {
    meta = loadMeta(metaPath);
    slug = meta['ID']; // 메타가 있으면 항상 메타의 ID를 슬러그로 사용
  }

  if (!meta && !slug && skipIfNoMeta) {
    console.log(`[skip] ${imagePath} — 매칭되는 .meta.txt 없음`);
    process.exit(0);
  }

  if (updateOnly && !meta) {
    console.error('--update는 메타파일이 있어야 합니다 (사이드카 <파일명>.meta.txt 또는 --meta=경로).');
    process.exit(1);
  }

  if (!slug) {
    console.error('슬러그를 알 수 없습니다. <슬러그>를 직접 넘기거나, 이미지와 같은 폴더에 "<파일명>.meta.txt"를 두세요.');
    process.exit(1);
  }

  return { imagePath, slug, margin, meta, updateOnly, sourceDpi, targetDpi };
}

// 원본이 저해상도(72dpi 등)면 물리 크기(인치)를 유지한 채 targetDpi로 리샘플 확대.
// 이미 targetDpi 이상이면(임베드된 density로 판단) 그대로 둔다.
async function upscaleToDpi(imagePath, sourceDpi, targetDpi) {
  const meta = await sharp(imagePath).metadata();
  const currentDpi = meta.density || sourceDpi;
  if (currentDpi >= targetDpi) {
    console.log(`[dpi] 이미 ${currentDpi}dpi ≥ 목표 ${targetDpi}dpi → 확대 생략`);
    return fs.readFileSync(imagePath);
  }
  const scale = targetDpi / currentDpi;
  const newWidth = Math.round(meta.width * scale);
  const newHeight = Math.round(meta.height * scale);
  console.log(`[dpi] ${currentDpi}dpi(${meta.width}x${meta.height}) → ${targetDpi}dpi(${newWidth}x${newHeight}) 확대 중 ...`);
  return sharp(imagePath)
    .resize(newWidth, newHeight, { kernel: sharp.kernel.lanczos3 })
    .withMetadata({ density: targetDpi })
    .toBuffer();
}

async function splitCells(imageInput, margin, targetDpi) {
  const img = sharp(imageInput);
  const { width, height } = await img.metadata();
  const cellW = Math.floor(width / COLS);
  const cellH = Math.floor(height / ROWS);

  if (margin * 2 >= Math.min(cellW, cellH)) {
    throw new Error(`margin(${margin})이 칸 크기(${cellW}x${cellH})에 비해 너무 큽니다`);
  }

  const buffers = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const left = col * cellW + margin;
      const top = row * cellH + margin;
      const cropW = cellW - margin * 2;
      const cropH = cellH - margin * 2;
      const buf = await sharp(imageInput)
        .extract({ left, top, width: cropW, height: cropH })
        .withMetadata({ density: targetDpi })
        .toBuffer();
      buffers.push(buf);
    }
  }
  return buffers;
}

function uploadOne(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// (확대 처리된) 10칸 그리드 이미지를 그대로 Cloudinary에 올려두고,
// 홍보용(네이버 블로그/카페)으로는 축소+워터마크된 URL을 돌려준다(원본 크기 유출 방지).
async function uploadGridPromo(imageBuffer, slug) {
  const publicId = `uncledison/coloring/${slug}/${slug}-grid`;
  const result = await uploadOne(imageBuffer, publicId);
  const promoUrl = CL.socialShare(CL.toPublicId(result.public_id), {
    cloud: process.env.CLOUDINARY_CLOUD || 'dhfobwnfc',
  });
  return promoUrl;
}

function metaToProperties(meta) {
  const tags = (meta['태그'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const properties = {
    '제목': { title: [{ text: { content: meta['제목'] } }] },
    'ID': { rich_text: [{ text: { content: meta['ID'] } }] },
    '유형': { select: { name: meta['유형'] || '시리즈' } },
    '난이도': { number: Number(meta['난이도']) || 1 },
    '소개': { rich_text: [{ text: { content: meta['소개'] || '' } }] },
    '스토리': { rich_text: [{ text: { content: (meta['스토리'] || []).join('\n') } }] },
  };
  if (meta['카테고리']) properties['카테고리'] = { select: { name: meta['카테고리'] } };
  if (tags.length) properties['태그'] = { multi_select: tags.map((name) => ({ name })) };
  return properties;
}

async function updateNotionRow(meta) {
  if (!process.env.NOTION_TOKEN) {
    throw new Error('NOTION_TOKEN이 없어 Notion 업데이트를 할 수 없습니다. .env에 NOTION_TOKEN을 추가하세요.');
  }
  const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
  const found = await notion.databases.query({
    database_id: NOTION_DB_ID,
    filter: { property: 'ID', rich_text: { equals: meta['ID'] } },
  });
  if (found.results.length === 0) {
    throw new Error(`ID="${meta['ID']}"인 기존 Notion 행을 못 찾았습니다. --update 없이 실행하면 새로 생성됩니다.`);
  }
  const page = found.results[0];
  const res = await notion.pages.update({
    page_id: page.id,
    properties: metaToProperties(meta), // 이미지·공개 값은 건드리지 않음
  });
  return res.url;
}

async function createNotionRow(meta, imageUrls) {
  if (!process.env.NOTION_TOKEN) {
    console.warn('[notion] NOTION_TOKEN이 없어 Notion 행 생성을 건너뜁니다. .env에 NOTION_TOKEN을 추가하세요.');
    return null;
  }
  const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
  const properties = {
    ...metaToProperties(meta),
    '이미지': { rich_text: [{ text: { content: imageUrls.join('\n') } }] },
    '공개': { checkbox: false },
  };

  const res = await notion.pages.create({
    parent: { database_id: NOTION_DB_ID },
    properties,
  });
  return res.url;
}

async function main() {
  const { imagePath, slug, margin, meta, updateOnly, sourceDpi, targetDpi } = parseArgs(process.argv.slice(2));

  if (updateOnly) {
    process.stdout.write(`[notion] ID="${slug}" 행의 메타데이터만 갱신 중 ... `);
    const pageUrl = await updateNotionRow(meta);
    console.log('완료');
    console.log(`\nNotion 행: ${pageUrl}`);
    console.log('이미지/공개 값은 그대로입니다. 사이트에 반영하려면 GitHub Actions에서 수동 재배포하세요.');
    return;
  }

  const upscaled = await upscaleToDpi(imagePath, sourceDpi, targetDpi);

  console.log(`[split] ${imagePath} → ${COLS}x${ROWS}칸, margin=${margin}px, 슬러그=${slug}`);
  const cells = await splitCells(upscaled, margin, targetDpi);

  const urls = [];
  for (let i = 0; i < cells.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    const publicId = `uncledison/coloring/${slug}/${slug}_${n}`;
    process.stdout.write(`[upload] ${n}/10 → ${publicId} ... `);
    const result = await uploadOne(cells[i], publicId);
    console.log('완료');
    urls.push(result.secure_url);
  }

  process.stdout.write('[upload] 홍보용 원본(축소+워터마크) ... ');
  const promoUrl = await uploadGridPromo(upscaled, slug);
  console.log('완료');
  console.log(`네이버 블로그/카페 홍보용 이미지: ${promoUrl}`);

  if (meta) {
    process.stdout.write('[notion] 미공개 행 생성 중 ... ');
    const pageUrl = await createNotionRow(meta, urls);
    if (pageUrl) {
      console.log('완료');
      console.log(`\nNotion 행: ${pageUrl}`);
      console.log('내용 확인 후 "공개" 체크하면 사이트에 발행됩니다.');
    } else {
      console.log('건너뜀');
    }
  } else {
    console.log('\n--- 아래 URL을 순서 그대로 Notion "이미지" 칸에 붙여넣으세요 ---\n');
    console.log(urls.join('\n'));
  }
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exit(1);
});
