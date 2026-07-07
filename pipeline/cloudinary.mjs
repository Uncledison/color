// pipeline/cloudinary.mjs
// 세로(portrait) 색칠도안 전용 Cloudinary URL 빌더.
// 원본 PNG 1장만 올리면 → 카드 썸네일 / 공유카드(제목 얹음) / 다운로드 원본을 URL로 자동 생성.

const BASE = (cloud) => `https://res.cloudinary.com/${cloud}/image/upload`;

// Notion에 붙여넣은 값(전체 URL 또는 public_id)을 → 변환에 쓸 bare public_id로 정규화.
// 예: https://res.cloudinary.com/dhfobwnfc/image/upload/v1782626800/uncledison/coloring/girl_exlznl.jpg
//   → uncledison/coloring/girl_exlznl
export function toPublicId(input) {
  let s = String(input).trim();
  const i = s.indexOf('/upload/');
  if (i !== -1) s = s.slice(i + '/upload/'.length); // URL이면 /upload/ 뒤만
  s = s.replace(/^v\d+\//, '');                       // 버전 제거
  s = s.replace(/\.(jpe?g|png|webp|gif|avif)$/i, '');  // 확장자 제거
  return s;
}

// Cloudinary 텍스트 오버레이 인코딩:
// 한글은 UTF-8 단일 인코딩(%XX)으로 두고, URL 구분자인 쉼표/슬래시만 이중 인코딩한다.
function encText(s) {
  return encodeURIComponent(String(s))
    .replace(/%2C/g, '%252C') // ,
    .replace(/%2F/g, '%252F'); // /
}

// Cloudinary 기본 제공 한글 폰트(업로드 불필요). 사이트 제목 폰트와 동일한 명조체.
// 대안: 'NanumGothic'(고딕). 환경변수 CLOUDINARY_FONT로 교체 가능.
const FONT = process.env.CLOUDINARY_FONT || 'NanumMyeongjo';

// ── 1) 사이트 카드 썸네일 (세로, 제목 없이 깔끔하게 — 카드에 제목 텍스트 별도 표시) ──
export function thumb(publicId, { cloud }) {
  return [
    BASE(cloud),
    'f_auto,q_auto',
    'w_500,h_700,c_fill,g_north',                 // 세로 5:7 카드
    publicId,
  ].join('/');
}

// ── 2) 공유 카드 og:image (1200×630 가로, 세로원본을 warm 배경에 패딩 + 제목 띠) ──
export function ogImage(publicId, { cloud, title }) {
  const t = encText(title);
  return [
    BASE(cloud),
    'f_auto,q_auto',
    'w_1200,h_630,c_pad,b_rgb:faf7f3',            // 세로 도안을 가로 카드에 여백 채움
    `l_text:${FONT}_52_bold:${t},co_white,b_rgb:c8442a,g_south,x_0,y_0,w_1100,c_fit`,
    publicId,
  ].join('/');
}

// ── 3) 다운로드용 원본 (우하단 워터마크 실제 픽셀에 각인, 강제 다운로드) ──
// 워터마크는 고딕(NanumGothic)으로 고정 — 명조체(FONT)보다 작은 크기에서 더 또렷하게 읽힘.
const WATERMARK_FONT = 'NanumGothic';
const DOWNLOAD_WATERMARK = encText('무료도안: color.uncledison.com');
export function download(publicId, { cloud, filename }) {
  const fn = filename ? `fl_attachment:${encodeURIComponent(filename)}` : 'fl_attachment';
  return [
    BASE(cloud),
    'f_png,q_auto',
    `l_text:${WATERMARK_FONT}_30_bold:${DOWNLOAD_WATERMARK},co_white,b_rgb:000000,g_south_east,x_20,y_20`,
    fn,
    publicId,
  ].join('/');
}

// ── 4) 모달 미리보기 (워터마크 얹은 화면용, 다운로드 방지 품질) ──
export function preview(publicId, { cloud }) {
  return [
    BASE(cloud),
    'f_auto,q_auto',
    'w_900,c_limit',
    publicId,
  ].join('/');
}
