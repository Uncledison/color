// pipeline/notion.mjs
// Notion DB(관제탑)에서 "공개=true" 행만 읽어 표준 item 배열로 변환.
// 반자동: 사람이 Notion에 행을 추가하고, ID를 Cloudinary 폴더/파일명과 동일하게 입력.

import { Client } from '@notionhq/client';
import { toPublicId } from './cloudinary.mjs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Notion 속성명 → 코드 키 매핑 (Notion에서 만든 컬럼 이름과 일치해야 함)
const P = {
  title: '제목',
  id: 'ID',
  type: '유형',        // Select: 시리즈 | 단일
  category: '카테고리', // Select
  tags: '태그',         // Multi-select
  difficulty: '난이도', // Number
  desc: '소개',         // Text
  image: '이미지',      // Text: Cloudinary URL/public_id, 시리즈는 줄바꿈으로 여러 개
  story: '스토리',      // Text: 줄바꿈으로 페이지별 1줄(이미지 순서와 동일)
  published: '공개',    // Checkbox
  pinterest: '핀터레스트', // Checkbox: 핀터레스트 자동 업로드 완료 여부
  blogText: '블로그글', // Text: 네이버 블로그 복사용 페이지의 본문 소스
};

const txt = (prop) =>
  (prop?.title || prop?.rich_text || []).map((t) => t.plain_text).join('') || '';
const sel = (prop) => prop?.select?.name || '';
const multi = (prop) => (prop?.multi_select || []).map((t) => t.name);
const num = (prop) => (typeof prop?.number === 'number' ? prop.number : null);
const check = (prop) => !!prop?.checkbox;

const lines = (s) => String(s).split('\n').map((x) => x.trim()).filter(Boolean);

export async function fetchPublishedItems() {
  const dbId = process.env.NOTION_DB_ID;
  const rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: P.published, checkbox: { equals: true } },
      start_cursor: cursor,
    });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return rows.map((row) => {
    const p = row.properties;
    const id = txt(p[P.id]).trim();
    const type = sel(p[P.type]) === '단일' ? 'single' : 'series';
    const imgs = lines(txt(p[P.image]));     // 붙여넣은 URL/public_id 목록(페이지 순서)
    const stories = lines(txt(p[P.story]));

    const pages = imgs.map((line, i) => ({
      n: i + 1,
      publicId: toPublicId(line),
      story: stories[i] || '',
    }));

    return {
      id,
      pageId: row.id,
      type,
      title: txt(p[P.title]).trim(),
      category: sel(p[P.category]),
      tags: multi(p[P.tags]),
      difficulty: num(p[P.difficulty]) || 1,
      desc: txt(p[P.desc]).trim(),
      pageCount: pages.length,
      cover: pages[0]?.publicId || '',
      pages,
      published: check(p[P.published]),
      pinterestDone: check(p[P.pinterest]),
      blogText: txt(p[P.blogText]),
    };
  }).filter((it) => it.id && it.title && it.pages.length);
}

// 핀터레스트 업로드 완료 후 노션 행에 체크 표시(다음 빌드에서 중복 업로드 방지)
export async function markPinterestDone(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: { [P.pinterest]: { checkbox: true } },
  });
}
