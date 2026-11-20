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

// ── 2) 공유 카드 og:image (1200×630 가로, 세로원본을 warm 배경에 패딩) ──
// 제목 텍스트 띠는 넣지 않음 — 카카오톡/네이버 등이 카드를 각자 비율로 잘라서 보여줄 때
// 가운데 정렬된 텍스트가 잘려 보이는 문제가 있어, 그림만 깨끗하게 노출되도록 함.
export function ogImage(publicId, { cloud }) {
  return [
    BASE(cloud),
    'f_auto,q_auto',
    'w_1200,h_630,c_pad,b_rgb:faf7f3',            // 세로 도안을 가로 카드에 여백 채움
    publicId,
  ].join('/');
}

// ── 3) 다운로드용 원본 (우하단 워터마크 실제 픽셀에 각인, 강제 다운로드) ──
// 워터마크는 고딕(NanumGothic)으로 고정 — 명조체(FONT)보다 작은 크기에서 더 또렷하게 읽힘.
//
// 워터마크 정책: 색칠도안은 기존처럼 우하단 검정 워터마크를 유지하고,
// 두뇌놀이(미로찾기·선잇기·점잇기)·스티커판(칭찬스티커판·체크표)은 원본에 이미 하단 문구가
// 들어가 있어 다운로드·인쇄·공유 변환에서 워터마크 오버레이를 넣지 않는다(watermark:false).
// build.mjs가 대분류를 보고 watermark 값을 넘긴다.
const WATERMARK_FONT = 'NanumGothic';
const DOWNLOAD_WATERMARK = encText('무료도안: color.uncledison.com');

// 오버레이 변환 문자열. watermark가 false면 빈 배열(변환 없음).
function watermarkTf(size, { x, y }) {
  return `l_text:${WATERMARK_FONT}_${size}_bold:${DOWNLOAD_WATERMARK},co_white,b_rgb:000000,g_south_east,x_${x},y_${y}`;
}
const tf = (list) => list.filter(Boolean);

export function download(publicId, { cloud, filename, watermark = true }) {
  const fn = filename ? `fl_attachment:${encodeURIComponent(filename)}` : 'fl_attachment';
  return [
    ...tf([
      BASE(cloud),
      'f_png,q_auto',
      watermark && watermarkTf(30, { x: 20, y: 20 }),
      fn,
    ]),
    publicId,
  ].join('/');
}

// ── 4) 모달 미리보기 (워터마크 얹은 화면용, 다운로드 방지 품질) ──
export function preview(publicId, { cloud, w = 900 }) {
  return [
    BASE(cloud),
    'f_auto,q_auto',
    `w_${w},c_limit`,
    publicId,
  ].join('/');
}

// ── 6) 인쇄용 (A4 한 장을 그대로 뽑는 용도, 다운로드본과 같은 워터마크) ──
// A4 150dpi(1240×1754)에 맞춰 폭 1240으로 제한. 브라우저 인쇄 대화상자에서
// "여백 없음 + A4 세로"로 뽑으면 한 장에 꽉 차게 나온다.
export function printable(publicId, { cloud, watermark = true }) {
  return [
    ...tf([
      BASE(cloud),
      'f_png,q_auto',
      'w_1240,c_limit',
      watermark && watermarkTf(22, { x: 14, y: 14 }),
    ]),
    publicId,
  ].join('/');
}

// ── 5) SNS(핀터레스트 등) 공유용 — 작게 + 워터마크 (원본 유출/스크랩 방지) ──
export function socialShare(publicId, { cloud, watermark = true }) {
  return [
    ...tf([
      BASE(cloud),
      'f_auto,q_auto',
      'w_600,c_limit',
      watermark && watermarkTf(22, { x: 14, y: 14 }),
    ]),
    publicId,
  ].join('/');
}
