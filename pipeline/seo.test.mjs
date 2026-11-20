// pipeline/seo.test.mjs — 검색 노출 메타 생성 규칙
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem } from './categories.mjs';
import {
  buildSeo,
  buildSeoAlt,
  buildSeoDescription,
  buildSeoTitle,
  jsonLdScript,
  SEO_LIMITS,
} from './seo.mjs';

const SITE = 'https://color.uncledison.com';

const COLOR = normalizeItem({
  id: 'grandma-knitting-scarf',
  type: 'series',
  title: '할머니의 털실 목도리',
  category: '계절',
  tags: ['겨울', '카툰'],
  desc: '겨울 방바닥에서 할머니가 목도리를 뜨다가 벌어지는 소동을 왕머리 유머 카툰으로 그린 8컷 색칠도안입니다.',
  pageCount: 8,
  pages: [{ n: 1, publicId: 'a' }],
  url: `${SITE}/p/grandma-knitting-scarf`,
  og: 'https://img/og.jpg',
  thumb: 'https://img/thumb.jpg',
});

const MAZE_SENIOR = normalizeItem({
  id: 'maze-winter-tree',
  type: 'single',
  title: '겨울 트리 미로 — 꼭대기 별까지',
  category: '미로찾기',
  audience: '어르신 인지용',
  desc: '겨울 트리 모양 미로입니다. 아래 줄기 입구에서 출발해 맨 위 별까지 길을 찾습니다. 86칸.',
  pageCount: 1,
  pages: [{ n: 1, publicId: 'b' }],
  url: `${SITE}/p/maze-winter-tree`,
  og: 'https://img/og2.jpg',
  thumb: 'https://img/thumb2.jpg',
});

const STICKER = normalizeItem({
  id: 'sticker-sled-50',
  type: 'single',
  title: '겨울 썰매 칭찬스티커판 (50칸)',
  mainCategory: '스티커판',
  category: '칭찬스티커판',
  audience: '유아용',
  desc: '겨울 썰매 테마의 50칸 칭찬스티커판입니다. 스티커를 한 칸씩 붙이며 칭찬을 모아보세요.',
  pageCount: 1,
  pages: [{ n: 1, publicId: 'c' }],
  url: `${SITE}/p/sticker-sled-50`,
  og: 'https://img/og3.jpg',
  thumb: 'https://img/thumb3.jpg',
});

const KID_MAZE = normalizeItem({
  id: 'maze-icecream',
  type: 'single',
  title: '아이스크림 미로찾기',
  category: '미로찾기',
  audience: '유아용',
  desc: '',
  pageCount: 1,
  pages: [{ n: 1, publicId: 'd' }],
  url: `${SITE}/p/maze-icecream`,
  og: 'https://img/og4.jpg',
  thumb: 'https://img/thumb4.jpg',
});

const FOLK = normalizeItem({
  id: 'heungbu-and-nolbu',
  type: 'series',
  title: '착한 흥부와 욕심쟁이 놀부',
  category: '전래동화',
  desc: '가난하지만 착한 흥부가 제비를 도와주고 큰 복을 받는 이야기입니다.',
  pageCount: 10,
  pages: [{ n: 1, publicId: 'e' }],
  url: `${SITE}/p/heungbu-and-nolbu`,
  og: 'https://img/og5.jpg',
  thumb: 'https://img/thumb5.jpg',
});

test('색칠도안 제목: 도안 제목 + 색칠공부·무료 인쇄 키워드', () => {
  const t = buildSeoTitle(COLOR);
  assert.ok(t.startsWith('할머니의 털실 목도리'));
  assert.match(t, /색칠공부 도안/);
  assert.match(t, /무료 인쇄/);
  assert.match(t, /8장/); // 시리즈 장수
  assert.ok(t.length <= SEO_LIMITS.title, `제목이 너무 김: ${t.length}`);
});

test('두뇌놀이(어르신) 제목: 어르신·치매예방·인지활동 계열 키워드', () => {
  const t = buildSeoTitle(MAZE_SENIOR);
  assert.match(t, /어르신/);
  assert.match(t, /치매예방/);
  assert.match(t, /미로찾기/);
  assert.ok(t.length <= SEO_LIMITS.title, `제목이 너무 김: ${t.length}`);
});

test('두뇌놀이(유아) 제목: 유아·활동지 키워드', () => {
  const t = buildSeoTitle(KID_MAZE);
  assert.match(t, /유아/);
  assert.match(t, /활동지/);
});

test('두뇌놀이 제목: 제목에 이미 있는 활동 이름은 반복하지 않는다', () => {
  // '아이스크림 미로찾기' → 미로찾기 한 번만
  const kid = buildSeoTitle(KID_MAZE);
  assert.equal((kid.match(/미로찾기/g) || []).length, 1);
  // '겨울 트리 미로 — …' → 미로찾기 키워드는 붙는다
  assert.match(buildSeoTitle(MAZE_SENIOR), /미로찾기/);
});

test('스티커판 제목: 유아 칭찬스티커판 키워드', () => {
  const t = buildSeoTitle(STICKER);
  assert.match(t, /칭찬스티커판/);
  assert.match(t, /무료 인쇄/);
});

test('제목은 62자를 넘지 않고, 넘칠 때는 브랜드 꼬리표를 먼저 뺀다', () => {
  const long = { ...COLOR, title: '아주아주 길고 긴 제목의 겨울 이야기 색칠도안 세트를 모아서 한 번에 프린트하는 이야기 모음집' };
  const t = buildSeoTitle(long);
  assert.ok(t.length <= SEO_LIMITS.title);
  assert.ok(!t.includes('| color.uncle'));
  assert.ok(t.includes(long.title));
});

test('설명: 원문 소개를 살리고 검색 문구를 붙이며 155자를 넘지 않는다', () => {
  const d = buildSeoDescription(COLOR);
  assert.ok(d.includes('할머니가 목도리를 뜨다가'));
  assert.match(d, /색칠공부 도안/);
  assert.ok(d.length <= SEO_LIMITS.description, `설명이 너무 김: ${d.length}`);

  for (const it of [MAZE_SENIOR, STICKER, KID_MAZE, FOLK]) {
    const desc = buildSeoDescription(it);
    assert.ok(desc.length > 20);
    assert.ok(desc.length <= SEO_LIMITS.description, `${it.id} 설명 ${desc.length}자`);
  }
});

test('설명: 소개가 없으면 검색 문구만으로 채운다', () => {
  assert.match(buildSeoDescription(KID_MAZE), /유아 두뇌놀이 활동지/);
});

test('설명: 아주 긴 소개는 문장 경계에서 줄이고 검색 문구는 끝까지 남긴다', () => {
  const long = { ...COLOR, desc: '가'.repeat(400) + ' 끝.' };
  const d = buildSeoDescription(long);
  assert.ok(d.length <= SEO_LIMITS.description);
  assert.match(d, /색칠공부 도안/);
});

test('alt: 제목 + 대분류에 맞는 명칭 + A4 무료 인쇄', () => {
  assert.match(buildSeoAlt(COLOR), /색칠공부 도안/);
  assert.match(buildSeoAlt(MAZE_SENIOR), /미로찾기 활동지/);
  assert.match(buildSeoAlt(STICKER), /칭찬스티커판 도안/);
  assert.match(buildSeoAlt(COLOR), /A4 무료 인쇄/);
});

test('JSON-LD: 대분류별 타입·필수 필드', () => {
  const color = buildSeo(COLOR, { site: SITE });
  assert.equal(color.jsonLd['@type'], 'CreativeWork');
  assert.equal(color.jsonLd.name, '할머니의 털실 목도리');
  assert.equal(color.jsonLd.url, COLOR.url);
  assert.equal(color.jsonLd.inLanguage, 'ko');
  assert.equal(color.jsonLd.isAccessibleForFree, true);
  assert.ok(color.jsonLd.image.length >= 1);
  assert.ok(color.jsonLd.keywords.includes('색칠공부 도안'));

  const maze = buildSeo(MAZE_SENIOR, { site: SITE });
  assert.equal(maze.jsonLd['@type'], 'LearningResource');
  assert.equal(maze.jsonLd.educationalLevel, '어르신');
  assert.match(maze.jsonLd.learningResourceType, /미로찾기/);
  assert.ok(maze.jsonLd.keywords.includes('치매예방 활동지'));

  const kid = buildSeo(KID_MAZE, { site: SITE });
  assert.equal(kid.jsonLd.educationalLevel, '유아');
});

test('JSON-LD는 script 태그를 깨뜨리는 문자열을 escape 한다', () => {
  const it = { ...COLOR, title: '제목 </script><script>alert(1)</script>' };
  const out = jsonLdScript(buildSeo(it, { site: SITE }).jsonLd);
  assert.ok(!out.includes('</script>'));
  assert.ok(out.includes('\\u003c'));
});
