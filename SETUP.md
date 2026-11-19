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
| 대분류 | Select | `색칠도안` / `두뇌놀이` / `스티커판` — **선택 컬럼**(없어도 빌드됨) |
| 카테고리 | Select | 대분류 안의 종류. 색칠도안: 동화/전통/자연…, 두뇌놀이: `미로찾기`/`선잇기`/`점잇기`, 스티커판: `칭찬스티커판`/`체크표` |
| 대상 | Select | 선택. `유아용` / `어르신 인지용` (없으면 태그로 유추) |
| 태그 | Multi-select | |
| 난이도 | Number | 1~3 |
| 소개 | Text | 공유 문구에 사용 |
| 페이지수 | Number | 시리즈만 |
| 스토리 | Text | 줄바꿈으로 페이지별 1줄 |
| 공개 | Checkbox | **켜면 발행** |

### 3대분류 규칙
- `대분류` 값이 비어 있으면 사이트가 **카테고리를 보고 자동 판별**하고, 판단이 안 되면 `색칠도안`으로 둡니다.
  (`미로·선잇기·점잇기…` → 두뇌놀이, `칭찬·스티커·체크표…` → 스티커판, 그 외 → 색칠도안)
- `대분류` 컬럼을 아직 만들지 않아도 빌드·화면은 그대로 동작합니다(기존 색칠도안 행은 전부 `색칠도안`).
- 3번째 대분류는 **`스티커판`**입니다. 노션에 옛 값 `생활·학습판`이 남아 있어도 자동으로 `스티커판`으로 읽습니다(하위 호환).
- `유형`이 `단일`인 항목(미로찾기·선잇기·점잇기·칭찬스티커판 등)은 시리즈용 10칸 그리드 이미지가 없으므로
  og/홍보 이미지를 **대표 이미지(첫 페이지)** 로 만듭니다. 별도 작업 없이 그냥 올리면 됩니다.

### Cloudinary 경로
`단일`은 `single/<ID>.png` 하나만 올리면 카드·상세·인쇄·다운로드가 모두 그 이미지로 만들어집니다.
(시리즈만 10칸 그리드 `<ID>/<ID>-grid` 를 홍보카드로 함께 만듭니다.)

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
  - GitHub 저장소 Actions 탭 → **Republish from Notion** → Run workflow (수동 트리거, `republish.yml`)

## 5. 네이버 공유 카드
- 네이버 서치어드바이저(searchadvisor.naver.com)에 `color.uncledison.com` 등록·소유확인.
- 내용 변경 시 "수집요청"으로 캐시 갱신.

## 로컬 테스트
```bash
npm install
CLOUDINARY_CLOUD=<클라우드명> node pipeline/build.mjs   # Notion 없으면 data.sample.json 사용
# 빌드 결과 확인 (public/ 이 사이트 루트)
python3 -m http.server 8080 --directory public   # → http://localhost:8080
```
- `data.sample.json`에는 3대분류 화면 확인용 샘플(미로찾기·점잇기·선잇기·칭찬스티커판·체크표)이 들어 있습니다.
- 실제 Notion 데이터로 빌드하려면 `NOTION_TOKEN`, `NOTION_DB_ID` 를 넣고 실행하세요.
