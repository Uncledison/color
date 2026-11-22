// pipeline/cloudinary.test.mjs
// 실행: npm test  (node --test pipeline/)
// 다운로드·인쇄·공유 URL의 워터마크 정책을 확인한다.
// - 색칠도안: 우하단 검정 배경 워터마크(l_text ... b_rgb:000000,g_south_east) 유지
// - 두뇌놀이·스티커판: 워터마크 오버레이 없이 깨끗한 고해상도 URL (build.mjs가 watermark:false 전달)

import test from 'node:test';
import assert from 'node:assert/strict';
import { download, printable, socialShare, WATERMARK_TEXT } from './cloudinary.mjs';

const CLOUD = 'dhfobwnfc';
const PID = 'uncledison/coloring/maze-circular-snowman/maze-circular-snowman';

test('색칠도안(기본값)은 다운로드·인쇄·공유 모두 워터마크 유지', () => {
  for (const url of [
    download(PID, { cloud: CLOUD, filename: 'good-brothers-01' }),
    printable(PID, { cloud: CLOUD }),
    socialShare(PID, { cloud: CLOUD }),
  ]) {
    assert.match(url, /l_text:NanumGothic_\d+_bold:/, url);
    assert.match(url, /co_white,b_rgb:000000,g_south_east/, url);
    assert.ok(url.includes(PID), url);
  }
});

test('워터마크 문구는 브랜드명 "무료도안 라라시스터"이고 URL에서 깨지지 않게 인코딩된다', () => {
  assert.equal(WATERMARK_TEXT, '무료도안 라라시스터');
  const expected = encodeURIComponent('무료도안 라라시스터'); // %EB%AC%B4...%20%EB%9D%BC...
  for (const url of [
    download(PID, { cloud: CLOUD, filename: 'good-brothers-01' }),
    printable(PID, { cloud: CLOUD }),
    socialShare(PID, { cloud: CLOUD }),
  ]) {
    assert.ok(url.includes(`l_text:NanumGothic_`), url);
    assert.ok(url.includes(`:${expected},`), url);
    assert.ok(!url.includes('color.uncledison.com,'), url);
  }
});

test('워터마크 없는 변환은 l_text 오버레이가 빠지고 원본 public_id만 남는다', () => {
  const d = download(PID, { cloud: CLOUD, filename: 'maze-circular-snowman-01', watermark: false });
  assert.equal(
    d,
    `https://res.cloudinary.com/${CLOUD}/image/upload/f_png,q_auto/fl_attachment:maze-circular-snowman-01/${PID}`
  );
  assert.ok(!d.includes('l_text'), d);

  const p = printable(PID, { cloud: CLOUD, watermark: false });
  assert.equal(p, `https://res.cloudinary.com/${CLOUD}/image/upload/f_png,q_auto/w_1240,c_limit/${PID}`);
  assert.ok(!p.includes('l_text'), p);

  const s = socialShare(PID, { cloud: CLOUD, watermark: false });
  assert.equal(s, `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto/w_600,c_limit/${PID}`);
  assert.ok(!s.includes('l_text'), s);
});

test('워터마크 없는 다운로드도 강제 다운로드(fl_attachment)와 PNG 고해상도 유지', () => {
  const url = download(PID, { cloud: CLOUD, watermark: false });
  assert.ok(url.includes('fl_attachment'), url);
  assert.ok(url.includes('f_png'), url);
});
