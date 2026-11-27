// pipeline/categories.test.mjs
// 실행: npm test  (node --test pipeline/)
// 3대분류 매핑이 기존 색칠도안 행을 그대로 '색칠도안'으로 두는지, 대분류 값이
// 비어 있어도 카테고리로 유추되는지, 옛 이름 '생활·학습판'이 '스티커판'으로
// 호환 매핑되는지를 확인한다. 의존성 없이 node:test 만 사용.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeMain, normalizeAudience, normalizeItem, buildShareText, MAIN, MAIN_ORDER,
} from './categories.mjs';

const SITE = 'https://color.uncledison.com';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('기존 색칠도안 행(대분류 값 없음)은 모두 색칠도안으로 유지', () => {
  // 운영 Notion 21개 행에 실제로 쓰인 카테고리
  for (const category of ['전통', '전래동화', '동화', '바다', '자연', '판타지', '어른용', '특수']) {
    assert.equal(normalizeMain('', category), MAIN.COLOR, category);
    assert.equal(normalizeAudience('', ['전래동화'], MAIN.COLOR, category), '');
  }
});

test('대분류 값 정규화(표기 흔들림 허용)', () => {
  assert.equal(normalizeMain('색칠도안', ''), MAIN.COLOR);
  assert.equal(normalizeMain('두뇌놀이', ''), MAIN.BRAIN);
  assert.equal(normalizeMain('스티커판', ''), MAIN.LIFE);
  assert.equal(normalizeMain('스티커', ''), MAIN.LIFE);
  assert.equal(normalizeMain('sticker', ''), MAIN.LIFE);
  assert.equal(normalizeMain('두뇌 놀이', ''), MAIN.BRAIN);
  assert.equal(normalizeMain(undefined, undefined), MAIN.COLOR);
});

test("옛 이름 '생활·학습판'은 '스티커판'으로 호환 매핑", () => {
  assert.equal(MAIN.LIFE, '스티커판');
  assert.equal(normalizeMain('생활·학습판', ''), MAIN.LIFE);
  assert.equal(normalizeMain('생활학습판', ''), MAIN.LIFE);   // 가운뎃점 없이 입력
  assert.equal(normalizeMain('생활 · 학습판', ''), MAIN.LIFE); // 공백
  assert.equal(normalizeMain('생활', ''), MAIN.LIFE);
  assert.equal(normalizeMain('학습판', ''), MAIN.LIFE);
});

test('카테고리만으로 대분류 유추', () => {
  assert.equal(normalizeMain('', '미로찾기'), MAIN.BRAIN);
  assert.equal(normalizeMain('', '선잇기'), MAIN.BRAIN);
  assert.equal(normalizeMain('', '점잇기'), MAIN.BRAIN);
  assert.equal(normalizeMain('', '칭찬스티커판'), MAIN.LIFE);
  assert.equal(normalizeMain('', '체크표'), MAIN.LIFE);
  assert.equal(normalizeMain('', '판타지'), MAIN.COLOR); // '판' 때문에 생활판으로 새지 않아야 함
});

test('대상(유아용 / 어르신 인지용)', () => {
  assert.equal(normalizeAudience('유아용', [], MAIN.BRAIN, '미로찾기'), '유아용');
  assert.equal(normalizeAudience('어르신 인지용', [], MAIN.BRAIN, '미로찾기'), '어르신 인지용');
  assert.equal(normalizeAudience('', ['유아용'], MAIN.BRAIN, '미로찾기'), '유아용');
  assert.equal(normalizeAudience('', ['어르신'], MAIN.BRAIN, '미로찾기'), '어르신 인지용');
  assert.equal(normalizeAudience('', [], MAIN.BRAIN, '미로찾기'), '');
});

test('normalizeItem 은 원본을 바꾸지 않는다', () => {
  const src = { id: 'x', category: '미로찾기', tags: ['유아용'] };
  const out = normalizeItem(src);
  assert.equal(src.mainCategory, undefined);
  assert.equal(out.mainCategory, MAIN.BRAIN);
  assert.equal(out.audience, '유아용');
});

test('대분류 표시 순서: 색칠도안 → 카드·편지지 → 두뇌놀이 → 스티커판', () => {
  assert.deepEqual(MAIN_ORDER, ['색칠도안', '카드·편지지', '두뇌놀이', '스티커판']);

  // 홈 화면은 index.html 안에서 순서를 직접 적으므로, 여기서 어긋나면 바로 잡는다.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mains = html.match(/const MAINS=\[([^\]]+)\]/);
  assert.ok(mains, 'index.html 의 MAINS 배열을 찾지 못함');
  const tabsOrder = mains[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
  assert.deepEqual(tabsOrder, MAIN_ORDER, '홈 상단 탭 순서');

  // 데스크톱 네비 · 히어로 바로가기 · 푸터도 같은 순서여야 한다
  const navOrder = [...html.matchAll(/class="nav-link[^"]*" data-main="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navOrder, MAIN_ORDER, '데스크톱 네비 순서');
  const heroOrder = [...html.matchAll(/<button class="hero-cat" onclick="selectMain\('([^']+)'\)"/g)].map((m) => m[1]);
  assert.deepEqual(heroOrder, MAIN_ORDER, '히어로 카테고리 순서');
  const footOrder = [...html.matchAll(/<li><a href="#" onclick="return selectMain\('([^']+)'\)"><img class="foot-ico"/g)].map((m) => m[1]);
  assert.deepEqual(footOrder, MAIN_ORDER, '푸터 카테고리 순서');
});

test('공유문구 — 색칠도안은 기존 문구 그대로', () => {
  assert.equal(
    buildShareText({ id: 'a', title: 'T', type: 'series', pageCount: 10, desc: 'D', mainCategory: MAIN.COLOR }, SITE),
    `🎨 T (색칠도안 10장)\n\nD\n무료로 다운받아 색칠해보세요!\n\n👉 ${SITE}/p/a`
  );
  assert.equal(
    buildShareText({ id: 'b', title: 'T', type: 'single', pageCount: 1, desc: 'D', mainCategory: MAIN.COLOR }, SITE),
    `🎨 T (색칠도안)\n\nD\n무료로 다운받아 색칠해보세요!\n\n👉 ${SITE}/p/b`
  );
});

test('공유문구 — 두뇌놀이·스티커판은 대분류 문구로 분기', () => {
  assert.equal(
    buildShareText({ id: 'c', title: '숫자 미로찾기', desc: 'D', mainCategory: MAIN.BRAIN, category: '미로찾기', audience: '어르신 인지용' }, SITE),
    `🧩 숫자 미로찾기 — 어르신 인지용\n\nD\n무료로 프린트해서 놀아보세요!\n\n👉 ${SITE}/p/c`
  );
  assert.equal(
    buildShareText({ id: 'd', title: '할 일 체크표', desc: 'D', mainCategory: MAIN.LIFE, category: '체크표' }, SITE),
    `⭐ 할 일 체크표 (스티커판)\n\nD\n무료로 프린트해서 바로 써보세요!\n\n👉 ${SITE}/p/d`
  );
});
