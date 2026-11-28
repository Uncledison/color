// pipeline/seo.mjs
// 도안 상세 페이지(/p/<id>)의 검색 노출(SEO) 메타를 만든다.
//
// 원칙:
// - 제목·설명에는 그 도안이 실제로 검색될 만한 말(색칠공부 도안 / 어르신 치매예방 인지활동 /
//   유아 칭찬스티커판 …)을 대분류·카테고리·대상에 맞춰 자연스럽게 넣는다.
// - 길이 상한을 지킨다(제목 62자, 설명 155자). 넘칠 때는 브랜드 꼬리표부터 양보하고,
//   그래도 넘치면 문장 경계에서 자른다 — 키워드가 잘려 나가지 않게.
// - 도안 데이터(노션)에 카테고리·대상이 비어 있어도 항상 그럴듯한 문구가 나온다.

import { MAIN, MAIN_COPY } from './categories.mjs';

const SITE_NAME = 'color.uncle';

export const SEO_LIMITS = { title: 62, description: 155 };

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const isSenior = (it) => it.audience === '어르신 인지용';
const isKid = (it) => it.audience === '유아용';
const subOf = (it, fallback) => norm(it.category) || fallback;

function unique(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = norm(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function clip(s, max) {
  const v = norm(s);
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1).trimEnd()}…`;
}

// 문장 경계에서 자르되, 너무 짧게 잘리면 그냥 글자 수로 자른다.
function clipSentence(s, max) {
  const v = norm(s);
  if (v.length <= max) return v;
  const cut = v.slice(0, max);
  const idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다. '), cut.lastIndexOf('요. '));
  if (idx >= 30) return cut.slice(0, idx + 1);
  return clip(v, max);
}

// 도안 제목은 절대 자르지 않는다. 넘칠 때는 (1) 브랜드 → (2) 뒤쪽 키워드 순으로 양보한다.
function fitTitle(title, phrases, brand = SITE_NAME) {
  const t = norm(title);
  const list = phrases.map(norm).filter(Boolean);
  for (let n = list.length; n >= 0; n--) {
    const core = [t, ...list.slice(0, n)].join(' ');
    const withBrand2 = `${core} | ${brand}`;
    if (withBrand2.length <= SEO_LIMITS.title) return withBrand2;
  }
  for (let n = list.length; n >= 0; n--) {
    const core = [t, ...list.slice(0, n)].join(' ');
    if (core.length <= SEO_LIMITS.title) return core;
  }
  return t;
}

/** <title> — 도안 제목 + 대분류/대상에 맞는 검색 키워드 */
export function buildSeoTitle(it) {
  const t = norm(it.title);
  const main = it.mainCategory;
  const pages = Number(it.pageCount) || 1;

  if (main === MAIN.BRAIN) {
    const activity = subOf(it, '두뇌놀이');
    // 제목에 이미 '미로찾기' 같은 활동 이름이 있으면 같은 말을 반복하지 않는다.
    const rep = t.includes(activity);
    if (isSenior(it))
      return fitTitle(t, ['| 어르신 치매예방 인지활동', rep ? '무료 인쇄 도안' : `${activity} 무료 인쇄 도안`]);
    if (isKid(it))
      return fitTitle(t, ['| 유아 두뇌놀이', rep ? '활동지 무료 인쇄' : `${activity} 활동지 무료 인쇄`]);
    return fitTitle(t, ['| 두뇌놀이', rep ? '활동지 무료 인쇄' : `${activity} 활동지 무료 인쇄`]);
  }

  if (main === MAIN.LIFE) {
    const activity = subOf(it, '스티커판');
    return /체크/.test(activity)
      ? fitTitle(t, ['| 생활습관 체크표', '무료 인쇄'])
      : fitTitle(t, ['| 유아 칭찬스티커판', '무료 인쇄']);
  }

  if (main === MAIN.CARD) {
    // 카드·편지지 세트는 '크리스마스 카드 도안 / 편지지 도안', 엽서는 '크리스마스 엽서 도안' 검색어로 들어온다.
    return fitTitle(t, [`| ${it.postcard ? '크리스마스 엽서 도안' : '크리스마스 카드 도안'}`, 'A4 무료 인쇄']);
  }

  const count = it.type === 'series' && pages > 1 ? `${pages}장` : '';
  return fitTitle(t, ['색칠공부 도안', count, '무료 인쇄']);
}

/** 검색엔진·SNS 카드에 쓰는 설명문 */
export function buildSeoDescription(it) {
  const main = it.mainCategory;
  const cat = norm(it.category);

  if (main === MAIN.BRAIN) {
    const tail = isSenior(it)
      ? 'A4 한 장으로 바로 인쇄해 쓰는 어르신 인지활동·치매예방 두뇌훈련 도안이에요.'
      : isKid(it)
        ? 'A4 한 장으로 바로 인쇄해 쓰는 유아 두뇌놀이 활동지예요.'
        : 'A4 한 장으로 바로 인쇄해 쓰는 무료 두뇌놀이 활동지예요.';
    return composeDescription(it.desc, tail);
  }

  if (main === MAIN.LIFE) {
    const tail = /체크/.test(cat)
      ? 'A4로 바로 인쇄해 매일 체크하며 쓰는 생활습관 체크표예요.'
      : 'A4로 바로 인쇄해 칸마다 스티커를 붙이는 유아 칭찬스티커판이에요.';
    return composeDescription(it.desc, tail);
  }

  if (main === MAIN.CARD) {
    const tail = it.postcard
      ? 'A4 가로 한 장을 인쇄해 가운데 점선을 따라 자르면 같은 엽서 2장이 되는 무료 엽서 도안이에요.'
      : it.type === 'single'
        ? '실선을 따라 오리고 붉은 점선을 뒤로 접으면 앞면·뒷면이 바뀌는 무료 플립카드예요.'
        : '카드·카드 봉투·편지지·편지 봉투를 A4 4장으로 바로 인쇄해 접고 붙이면 완성되는 무료 세트예요.';
    return composeDescription(it.desc, tail);
  }

  const tail = cat
    ? `${cat} 테마 색칠공부 도안으로 A4에 바로 인쇄해 색칠할 수 있어요.`
    : '무료 색칠공부 도안으로 A4에 바로 인쇄해 색칠할 수 있어요.';
  return composeDescription(it.desc, tail);
}

export function composeDescription(base, tail, max = SEO_LIMITS.description) {
  const b = norm(base).replace(/\s*[.]?\s*$/, '.');
  const t = norm(tail);
  if (!b || b === '.') return clip(t, max);
  if (`${b} ${t}`.length <= max) return `${b} ${t}`;
  const room = max - t.length - 1;
  if (room >= 30) return `${clipSentence(b, room)} ${t}`;
  return clip(b, max);
}

/** JSON-LD keywords용 목록(중복 제거) */
export function buildSeoKeywords(it) {
  const main = it.mainCategory;
  const cat = norm(it.category);
  const tags = Array.isArray(it.tags) ? it.tags : [];
  const base = [norm(it.title)];

  if (main === MAIN.BRAIN) {
    const activity = cat || '두뇌놀이';
    return unique([
      ...base,
      activity,
      `${activity} 도안`,
      `${activity} 무료 인쇄`,
      isSenior(it) ? '어르신 인지활동' : '',
      isSenior(it) ? '치매예방 활동지' : '',
      isSenior(it) ? '노인 두뇌훈련' : '',
      isKid(it) ? '유아 두뇌놀이' : '',
      '무료 활동지 인쇄',
      ...tags,
    ]);
  }

  if (main === MAIN.LIFE) {
    const activity = cat || '스티커판';
    return unique([
      ...base,
      activity,
      `${activity} 무료 인쇄`,
      '스티커판 도안',
      /체크/.test(activity) ? '생활습관 체크표' : '유아 칭찬스티커판',
      ...tags,
    ]);
  }

  if (main === MAIN.CARD) {
    const flip = it.type === 'single';
    if (it.postcard) {
      return unique([
        ...base,
        '크리스마스 엽서',
        '크리스마스 엽서 도안',
        '엽서 만들기',
        '손편지 엽서',
        '다이컷 엽서',
        'A4 프린트',
        '무료 엽서 도안',
        ...tags,
      ]);
    }
    return unique([
      ...base,
      '크리스마스 카드 도안',
      '크리스마스 카드 만들기',
      flip ? '플립카드' : '크리스마스 편지지',
      flip ? '뒤집기 카드' : '',
      flip ? '카드 도안' : '편지지 도안',
      flip ? '' : '카드 봉투 도안',
      flip ? '' : '편지 봉투 도안',
      'A4 프린트',
      '무료 카드 도안',
      ...tags,
    ]);
  }

  return unique([
    ...base,
    '색칠공부 도안',
    '색칠도안',
    '무료 색칠공부',
    '색칠공부 프린트',
    cat ? `${cat} 색칠공부` : '',
    it.type === 'series' ? `${it.pageCount}장 색칠도안` : '',
    ...tags,
  ]);
}

/** 이미지 alt — 화면 낭독기와 이미지 검색에 쓰인다 */
export function buildSeoAlt(it) {
  const t = norm(it.title);
  const main = it.mainCategory;
  const cat = norm(it.category);
  const noun =
    main === MAIN.COLOR
      ? '색칠공부 도안'
      : main === MAIN.BRAIN
        ? `${cat || '두뇌놀이'} 활동지`
        : main === MAIN.CARD
          ? it.postcard
            ? '도안' // 제목이 이미 '…엽서'로 끝나므로 '엽서 도안'을 붙이면 같은 말이 두 번 나온다
            : '카드·편지지 도안'
          : `${cat || '스티커판'} 도안`;
  return `${t} ${noun} — A4 무료 인쇄`;
}

/** JSON-LD — 색칠도안·스티커판은 CreativeWork, 두뇌놀이는 LearningResource */
export function buildJsonLd(it, seo, { site }) {
  const main = it.mainCategory;
  const cat = norm(it.category);
  const learning = main === MAIN.BRAIN;
  const doc = {
    '@context': 'https://schema.org',
    '@type': learning ? 'LearningResource' : 'CreativeWork',
    name: norm(it.title),
    description: seo.description,
    url: it.url,
    image: [it.og, it.thumb].filter(Boolean),
    inLanguage: 'ko',
    isAccessibleForFree: true,
    isFamilyFriendly: true,
    keywords: seo.keywords.join(', '),
    author: { '@type': 'Organization', name: SITE_NAME, url: site },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: site },
    license: `${site}/copyright.html`,
  };

  if (cat) doc.genre = cat;

  if (learning) {
    doc.learningResourceType = `${cat || '활동지'} 활동지`;
    doc.educationalLevel = isSenior(it) ? '어르신' : isKid(it) ? '유아' : '전 연령';
    doc.audience = {
      '@type': 'PeopleAudience',
      audienceType: isSenior(it) ? '어르신 인지활동' : isKid(it) ? '유아·어린이' : '아이와 어르신',
    };
  }

  return doc;
}

/** 한 도안의 SEO 묶음. ogPage()가 그대로 HTML에 꽂는다. */
export function buildSeo(it, { site }) {
  const title = buildSeoTitle(it);
  const description = buildSeoDescription(it);
  const keywords = buildSeoKeywords(it);
  const seo = {
    title,
    description,
    keywords,
    alt: buildSeoAlt(it),
    ogTitle: norm(it.title),
    ogDescription: description,
  };
  seo.jsonLd = buildJsonLd(it, seo, { site });
  return seo;
}

/** <script type="application/ld+json"> 안에 안전하게 넣기 */
export function jsonLdScript(doc) {
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}

/** 카테고리 라벨(대분류 한국어 명칭) — 제목·설명에 쓰는 기본 말 */
export function mainNoun(it) {
  return (MAIN_COPY[it.mainCategory] || MAIN_COPY[MAIN.COLOR]).noun;
}
