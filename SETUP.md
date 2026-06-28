# color.uncle 자동 발행 — 설정 가이드 (Notion 반자동)

## 흐름 한눈에
1. Cloudinary에 도안 PNG 업로드 (폴더가 종류를 결정)
2. Notion DB에 행 추가 → 제목·태그 입력 → **공개 ✅**
3. Vercel 빌드(`pipeline/build.mjs`)가 Notion 읽어 `public/data.json` + OG 페이지 생성
4. 사이트가 `data.json`을 읽어 자동 렌더링

## 1. Cloudinary 폴더 규칙
```
series/<시리즈ID>/01.png ~ NN.png   ← 동화 등 여러 장 (파일명 순서 = 페이지)
single/<도안ID>.png                 ← 낱장 도안
```
- 모든 도안은 **세로(portrait)**.
- ID는 영문/숫자/하이픈 (예: rabbit-turtle). Notion의 ID 칸과 **반드시 동일**.

## 2. Notion DB 컬럼 (이 이름 그대로)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| 제목 | Title | 공유카드·썸네일에 얹힘 |
| ID | Text | Cloudinary 폴더/파일명과 동일 |
| 유형 | Select | `시리즈` / `단일` |
| 카테고리 | Select | 동화/자연/판타지… |
| 태그 | Multi-select | |
| 난이도 | Number | 1~3 |
| 소개 | Text | 공유 문구에 사용 |
| 페이지수 | Number | 시리즈만 |
| 스토리 | Text | 줄바꿈으로 페이지별 1줄 |
| 공개 | Checkbox | **켜면 발행** |

## 3. 환경변수 (Vercel → Settings → Environment Variables)
| 키 | 값 |
|---|---|
| `NOTION_TOKEN` | Notion 내부 통합 시크릿 (notion.so/my-integrations) |
| `NOTION_DB_ID` | DB ID (DB URL의 32자리) |
| `CLOUDINARY_CLOUD` | Cloudinary 클라우드명 |
| `SITE_URL` | https://color.uncledison.com |

> Notion 통합을 만든 뒤 해당 DB에서 `...` → Connections → 통합 연결 필수.

## 4. Vercel 빌드 설정
- `vercel.json`이 `buildCommand: node pipeline/build.mjs`, `outputDirectory: public` 지정.
- Vercel은 git push마다 빌드. **Notion에서 공개만 켠 경우**는 push가 없으므로:
  - Vercel → Settings → Git → **Deploy Hook** 생성
  - GitHub → Settings → Secrets → Actions → `VERCEL_DEPLOY_HOOK` 저장
  - `.github/workflows/republish.yml`이 30분마다 자동 재배포

## 5. 네이버 공유 카드
- 네이버 서치어드바이저(searchadvisor.naver.com)에 `color.uncledison.com` 등록·소유확인.
- 내용 변경 시 "수집요청"으로 캐시 갱신.

## 로컬 테스트
```bash
npm install
CLOUDINARY_CLOUD=<클라우드명> node pipeline/build.mjs   # Notion 없으면 data.sample.json 사용
```
