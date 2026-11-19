// pipeline/categories.mjs
// 3대분류(🎨 색칠도안 · 🧩 두뇌놀이 · ⭐ 생활·학습판) 표준화.
//
// 노션에 '대분류' Select 컬럼이 아직 없거나, 있어도 값이 비어 있는 기존 행이 있어도
// 빌드가 멈추지 않도록: (1) '대분류' 값 → (2) '카테고리' 키워드 유추 → (3) 기본값 '색칠도안'
// 순서로 항상 값을 채운다. 기존 21개 색칠도안 행은 카테고리(전통/전래동화/동화/바다)가
// 모두 색칠도안이므로 결과가 그대로 유지된다(하위 호환).

export const MAIN = {
  COLOR: '색칠도안',
  BRAIN: '두뇌놀이',
  LIFE: '생활·학습판',
};

export const MAIN_ORDER = [MAIN.COLOR, MAIN.BRAIN, MAIN.LIFE];

// 두뇌놀이 표준 하위분류
export const BRAIN_SUBS = ['미로찾기', '선잇기', '점잇기'];
// 생활·학습판 표준 하위분류
export const LIFE_SUBS = ['칭찬스티커판', '체크표'];
// 두뇌놀이 대상 필터
export const AUDIENCES = ['유아용', '어르신 인지용'];

// 대분류별 문구(공유문구·OG·복사용 페이지에서 공통 사용)
export const MAIN_COPY = {
  [MAIN.COLOR]: {
    emoji: '🎨',
    noun: '색칠도안',
    cta: '무료로 다운받아 색칠해보세요!',
    ogLabel: '무료 색칠도안',
    pageNoun: '색칠도안',
  },
  [MAIN.BRAIN]: {
    emoji: '🧩',
    noun: '두뇌놀이',
    cta: '무료로 프린트해서 놀아보세요!',
    ogLabel: '무료 두뇌놀이',
    pageNoun: '두뇌놀이 활동지',
  },
  [MAIN.LIFE]: {
    emoji: '⭐',
    noun: '생활·학습판',
    cta: '무료로 프린트해서 바로 써보세요!',
    ogLabel: '무료 생활·학습판',
    pageNoun: '생활·학습판',
  },
};

// 표기 흔들림 흡수: 공백·가운뎃점·하이픈·슬래시·점 제거 + 소문자
const key = (s) => String(s ?? '').toLowerCase().replace(/[\s·・.．\-_/()]/g, '');

const MAIN_ALIASES = new Map([
  ['색칠도안', MAIN.COLOR], ['색칠', MAIN.COLOR], ['도안', MAIN.COLOR], ['coloring', MAIN.COLOR],
  ['두뇌놀이', MAIN.BRAIN], ['두뇌', MAIN.BRAIN], ['brain', MAIN.BRAIN], ['퍼즐', MAIN.BRAIN], ['놀이', MAIN.BRAIN],
  ['생활학습판', MAIN.LIFE], ['생활학습', MAIN.LIFE], ['생활', MAIN.LIFE], ['학습판', MAIN.LIFE],
  ['스티커판', MAIN.LIFE], ['life', MAIN.LIFE],
]);

// '카테고리'만 보고 대분류를 유추할 때 쓰는 키워드
const BRAIN_KEYWORDS = [
  '미로', '선잇기', '점잇기', '점선잇기', '퍼즐', '다른그림', '틀린그림', '숨은그림',
  '낱말', '퀴즈', '기억', '짝맞추기', '같은그림', '관찰', '집중놀이', '브레인',
];
const LIFE_KEYWORDS = [
  '칭찬', '스티커', '체크표', '체크리스트', '생활', '학습', '계획표', '일과표',
  '이름표', '달력', '용돈', '심부름', '습관', '스티커판', '칭찬판', '생활판', '학습판',
];

const SENIOR_KEYWORDS = ['어르신', '어른신', '시니어', '인지', '치매', '요양', '노인', '경로', '실버', 'senior'];
const KID_KEYWORDS = ['유아', '아이', '어린이', '키즈', '아동', '초등', 'kid'];

/**
 * '대분류' 원시값과 '카테고리'로 대분류를 확정한다.
 * @param {string} rawMain   노션 '대분류' 값(없으면 '')
 * @param {string} category  노션 '카테고리' 값
 */
export function normalizeMain(rawMain, category = '') {
  const direct = MAIN_ALIASES.get(key(rawMain));
  if (direct) return direct;

  const cat = key(category);
  if (cat) {
    if (BRAIN_KEYWORDS.some((k) => cat.includes(k))) return MAIN.BRAIN;
    if (LIFE_KEYWORDS.some((k) => cat.includes(k))) return MAIN.LIFE;
  }
  return MAIN.COLOR; // 기본값 — 기존 색칠도안 행은 전부 여기로
}

/**
 * 대상(유아용 / 어르신 인지용). '대상' 컬럼이 있으면 그 값을, 없으면 태그·카테고리로 유추.
 * 색칠도안은 대상 구분을 쓰지 않으므로 빈 값.
 */
export function normalizeAudience(rawAudience, tags = [], mainCategory = MAIN.COLOR, category = '') {
  const explicit = String(rawAudience || '').trim();
  if (explicit) {
    const k = key(explicit);
    if (SENIOR_KEYWORDS.some((w) => k.includes(key(w)))) return AUDIENCES[1];
    if (KID_KEYWORDS.some((w) => k.includes(key(w)))) return AUDIENCES[0];
  }
  if (mainCategory === MAIN.COLOR) return '';

  const hay = [category, ...(tags || [])].map(key).join('|');
  if (SENIOR_KEYWORDS.some((w) => hay.includes(key(w)))) return AUDIENCES[1];
  if (KID_KEYWORDS.some((w) => hay.includes(key(w)))) return AUDIENCES[0];
  return '';
}

/** item 한 건에 mainCategory/audience를 채워 돌려준다(원본 불변). */
export function normalizeItem(it) {
  const mainCategory = normalizeMain(it.mainCategory, it.category);
  const audience = normalizeAudience(it.audience, it.tags, mainCategory, it.category);
  return { ...it, mainCategory, audience };
}

/** 공유 문구 — 대분류에 맞는 문구로 분기(색칠도안 문구는 기존과 동일). */
export function buildShareText(it, siteUrl) {
  const copy = MAIN_COPY[it.mainCategory] || MAIN_COPY[MAIN.COLOR];
  const url = `${siteUrl}/p/${it.id}`;
  if (it.mainCategory === MAIN.COLOR) {
    // 기존 문구 그대로(하위 호환)
    return (
      `🎨 ${it.title}` +
      (it.type === 'series' ? ` (색칠도안 ${it.pageCount}장)` : ' (색칠도안)') +
      `\n\n${it.desc}\n무료로 다운받아 색칠해보세요!\n\n👉 ${url}`
    );
  }
  const parts = [];
  if (it.category && !String(it.title).includes(it.category)) parts.push(it.category);
  if (it.audience) parts.push(it.audience);
  const detail = parts.join(' · ');
  const head = `${copy.emoji} ${it.title}` + (detail ? ` — ${detail}` : ` (${copy.noun})`);
  return `${head}\n\n${it.desc}\n${copy.cta}\n\n👉 ${url}`;
}

/** 카드·OG에서 쓰는 짧은 분류 라벨: '미로찾기 · 유아용' */
export function categoryLabel(it) {
  return [it.category, it.audience].filter(Boolean).join(' · ');
}
