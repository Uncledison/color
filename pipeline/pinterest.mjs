// pipeline/pinterest.mjs — 노션 "공개" 항목을 핀터레스트에 자동 업로드
// Sandbox: https://api-sandbox.pinterest.com/v5 (테스트용, 실제 공개 계정엔 안 보임)
// Standard 승인 후엔 PINTEREST_API_BASE=https://api.pinterest.com/v5 로 전환

const BASE = process.env.PINTEREST_API_BASE || 'https://api-sandbox.pinterest.com/v5';
const TOKEN = process.env.PINTEREST_ACCESS_TOKEN;
const BOARD_NAME = 'color.uncle 색칠도안';

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Pinterest API ${path} ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

let boardIdCache = process.env.PINTEREST_BOARD_ID || null;
async function getOrCreateBoard() {
  if (boardIdCache) return boardIdCache;
  const list = await call('/boards');
  const existing = (list.items || []).find((b) => b.name === BOARD_NAME);
  if (existing) {
    boardIdCache = existing.id;
    return boardIdCache;
  }
  try {
    const created = await call('/boards', {
      method: 'POST',
      body: JSON.stringify({
        name: BOARD_NAME,
        description: 'color.uncledison.com 무료 색칠도안',
        privacy: 'PUBLIC',
      }),
    });
    boardIdCache = created.id;
  } catch (e) {
    // Sandbox API의 목록 조회가 방금 만든 보드를 즉시 반영하지 않는 경우가 있어
    // "이미 존재함" 에러가 나면 PINTEREST_BOARD_ID를 .env에 직접 고정해야 함
    throw new Error(
      `보드를 찾거나 만들 수 없음: ${e.message}\n→ Pinterest에서 보드 ID를 확인해 .env에 PINTEREST_BOARD_ID=<id> 로 고정해주세요.`
    );
  }
  return boardIdCache;
}

async function createPin({ title, description, link, imageUrl }) {
  const boardId = await getOrCreateBoard();
  return call('/pins', {
    method: 'POST',
    body: JSON.stringify({
      board_id: boardId,
      title,
      description,
      link,
      media_source: { source_type: 'image_url', url: imageUrl },
    }),
  });
}

// item(enrich() 이후의 표준 item, pg.preview 포함) → 페이지별 핀 생성
export async function publishItemToPinterest(item) {
  const results = [];
  for (const pg of item.pages) {
    try {
      const pin = await createPin({
        title: `${item.title} - 무료 색칠도안`,
        description: `${item.desc || item.title}\n무료로 다운받아 색칠해보세요! color.uncle`,
        link: item.url,
        imageUrl: pg.social,
      });
      results.push({ ok: true, page: pg.n, pinId: pin.id });
    } catch (e) {
      results.push({ ok: false, page: pg.n, error: e.message });
    }
  }
  return results;
}
