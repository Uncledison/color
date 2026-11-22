// pipeline/page.mjs
// 도안 상세 페이지(/p/<id>) 렌더러.
//
// 원칙
// - 검색(구글·네이버)·SNS(핀터레스트·카톡)로 **바로 들어온** 방문자가 한 번 더 클릭하지 않고
//   그 자리에서 미리보기 · 인쇄 · 다운로드 · 공유 복사를 할 수 있어야 한다.
//   (예전엔 썸네일 1장 + '/#id' 보러가기 버튼뿐이라, 들어온 사람이 다시 홈으로 가야 했다.)
// - SEO 메타(<title>·description·og:*·canonical·JSON-LD)와 내부 링크는 기존 것을 그대로 쓰거나 넓힌다.
// - 인쇄·다운로드는 홈과 같은 '5초 커피 후원' 게이트를 거친다(운영 정책 유지).
// - 홈(index.html)은 /#<id> 옛 주소를 계속 열어주고, 주소창만 /p/<id> 로 바꾼다(하위 호환).

import { MAIN, MAIN_COPY, categoryLabel } from './categories.mjs';
import { buildSeo, jsonLdScript } from './seo.mjs';

export function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const copyOf = (it) => MAIN_COPY[it.mainCategory] || MAIN_COPY[MAIN.COLOR];

/** 인라인 <script> 안에 넣어도 태그가 깨지지 않는 JSON */
function jsonSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// 같은 대분류의 다른 도안 링크 — 검색봇이 모든 /p/ 페이지를 찾아가는 내부 링크가 된다.
export function relatedHtml(list, copy) {
  if (!list.length) return '';
  const links = list
    .map((r) => `<a class="rel-link" href="/p/${esc(r.id)}">${esc(r.title)}</a>`)
    .join('');
  return `<section class="related">
    <h2>${esc(copy.noun)} 더 보기</h2>
    <div class="rel-list">${links}</div>
  </section>`;
}

/** 관련 도안: 같은 카테고리를 앞에, 그다음 같은 대분류 순으로 최대 limit개 */
export function relatedFor(it, items, limit = 6) {
  const same = (o) => (o.category || '') === (it.category || '');
  const pool = items.filter((o) => o.id !== it.id && o.mainCategory === it.mainCategory);
  return [...pool.filter(same), ...pool.filter((o) => !same(o))].slice(0, limit);
}

function difficultyDots(n) {
  const v = Math.max(0, Math.min(3, Number(n) || 0));
  let out = '';
  for (let i = 0; i < 3; i++) out += `<i class="dot${i < v ? ' on' : ''}"></i>`;
  return out;
}

/** 도안 한 장(장 번호, 이야기, 미리보기·인쇄·저장 URL)을 카드로 */
function sheetHtml(it, pg, index) {
  const label = `${it.title} ${pg.n}번째 장`;
  const story = String(pg.story || '').trim();
  return `      <li class="sheet">
        <button class="thumb" type="button" onclick="openZoom(${pg.n})" aria-label="${esc(label)} 크게 보기">
          <img src="${esc(pg.small || pg.preview || it.thumb)}" alt="${esc(label)}"${index === 0 ? '' : ' loading="lazy"'} decoding="async">
          <span class="zoom-hint">크게 보기</span>
        </button>
        <div class="sheet-body">
          <div class="sheet-head"><span class="num">${esc(pg.n)}</span><span class="sheet-label">${pg.n}번째 장</span></div>
          ${story ? `<p class="story">${esc(story)}</p>` : ''}
          <div class="mini-acts">
            <button class="mini" type="button" onclick="askPrint(${pg.n})">🖨 인쇄</button>
            <button class="mini primary" type="button" onclick="askDownload(${pg.n})">⬇ 저장</button>
          </div>
        </div>
      </li>`;
}

const STYLE = `
  :root{--ink:#3d2b1f;--ink-2:#5c4a38;--ink-3:#8a7860;--warm:#fff7e6;--coral:#f2a72e;--accent:#c8442a;
        --bg:#faf7f3;--card:#fff;--border:rgba(61,43,31,.12)}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'Noto Sans KR',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:var(--bg);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  img{display:block;max-width:100%}
  a{color:inherit;text-decoration:none}
  button{font-family:inherit;color:inherit}

  .top{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;
       padding:12px 18px;background:rgba(250,247,243,.94);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--border)}
  .brand{font-family:'Jua',sans-serif;font-size:18px;letter-spacing:-.01em}
  .brand em{font-style:normal;color:var(--accent)}
  .top-link{font-size:13px;font-weight:700;color:var(--ink-2);padding:8px 15px;border:1px solid var(--border);border-radius:100px;background:#fff}

  .wrap{max-width:680px;margin:0 auto;padding:20px 18px 60px}
  .crumbs{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-3);margin-bottom:12px}
  .crumbs a{text-decoration:underline;text-underline-offset:2px}
  h1{font-family:'Jua',sans-serif;font-size:clamp(24px,6.4vw,34px);line-height:1.28;letter-spacing:-.01em;margin-bottom:10px;word-break:keep-all}
  .lede{font-size:15px;color:var(--ink-2);margin-bottom:16px;word-break:keep-all}
  .facts{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin-bottom:18px}
  .facts li{font-size:12px;color:var(--ink-2);background:#fff;border:1px solid var(--border);border-radius:100px;padding:5px 11px;display:inline-flex;align-items:center;gap:5px}
  .facts b{color:var(--ink);font-weight:700}
  .dot{width:6px;height:6px;border-radius:50%;background:rgba(61,43,31,.16);display:inline-block}
  .dot.on{background:var(--coral)}

  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .btn{height:50px;padding:0 22px;border:none;border-radius:100px;font-size:15px;font-weight:700;
       display:inline-flex;align-items:center;gap:7px;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
  .btn:active{transform:translateY(1px)}
  .btn.wide{flex:1 1 100%}
  .btn.half{flex:1 1 calc(50% - 4px)}
  @media (min-width:720px){.btn.wide,.btn.half{flex:0 0 auto}}
  .btn-primary{background:var(--accent);color:#fff;box-shadow:0 8px 20px rgba(200,68,42,.22)}
  .btn-ghost{background:#fff;border:1px solid var(--border)}
  .acts-note{font-size:12px;color:var(--ink-3);margin-bottom:26px;line-height:1.6}

  h2{font-size:16px;font-weight:700;margin:0 0 12px;display:flex;align-items:center;gap:8px}
  h2 .cnt{font-size:12px;font-weight:600;color:var(--ink-3)}

  .grid{list-style:none;display:grid;grid-template-columns:1fr;gap:18px}
  .sheet{background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;
         box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 28px rgba(0,0,0,.05)}
  .thumb{position:relative;display:block;width:100%;padding:0;border:none;background:#f4efe8;cursor:zoom-in}
  .thumb img{width:100%;aspect-ratio:210/297;object-fit:contain;background:#fff}
  .zoom-hint{position:absolute;right:10px;bottom:10px;font-size:11px;font-weight:700;color:#3d2b1f;
             background:rgba(255,255,255,.92);border:1px solid var(--border);border-radius:100px;padding:4px 10px}
  .sheet-body{padding:12px 15px 15px}
  .sheet-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .num{flex:none;width:22px;height:22px;border-radius:50%;background:var(--warm);color:var(--accent);
       font-size:12px;font-weight:700;display:grid;place-items:center}
  .sheet-label{font-size:12px;font-weight:700;color:var(--ink-3);letter-spacing:.02em}
  .story{font-size:13px;color:var(--ink-2);word-break:keep-all}
  .mini-acts{display:flex;gap:7px;margin-top:11px}
  .mini{flex:1;height:40px;border-radius:100px;font-size:13px;font-weight:700;border:1px solid var(--border);
        background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
  .mini.primary{background:var(--ink);border-color:var(--ink);color:#fff}
  .mini:active{transform:translateY(1px)}

  /* '단일' 워크시트는 A4 한 장을 크게 */
  .single-card{max-width:520px;margin:0 auto;background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;
               box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 36px rgba(0,0,0,.08)}
  .single-card .thumb{border-radius:0}

  .howto{margin-top:34px;background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px 18px}
  .howto h2{margin-bottom:8px}
  .howto ul{list-style:none;font-size:13px;color:var(--ink-2)}
  .howto li{padding-left:14px;position:relative;margin-top:4px}
  .howto li::before{content:'';position:absolute;left:0;top:.65em;width:5px;height:5px;border-radius:50%;background:var(--coral)}

  .related{margin-top:30px;padding-top:22px;border-top:1px solid var(--border)}
  .rel-list{display:flex;flex-wrap:wrap;gap:8px}
  .rel-link{display:inline-block;padding:7px 12px;border-radius:100px;background:#fff;border:1px solid var(--border);
            color:var(--ink-2);font-size:13px}
  .rel-link:hover{border-color:var(--accent);color:var(--accent)}

  .home-cta{display:flex;align-items:center;justify-content:center;height:52px;margin-top:26px;border-radius:100px;
            background:var(--ink);color:#fff;font-size:15px;font-weight:700}
  .foot{margin-top:30px;text-align:center;font-size:12px;color:var(--ink-3);line-height:1.9}
  .foot a{text-decoration:underline;text-underline-offset:2px}

  /* ── 크게 보기(라이트박스) ── */
  .zoom{display:none;position:fixed;inset:0;z-index:900;background:rgba(24,18,13,.94);padding:16px;
        align-items:center;justify-content:center}
  .zoom.open{display:flex}
  .zoom img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;background:#fff;border-radius:6px}
  .zoom-close{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;border:none;
              background:rgba(255,255,255,.14);color:#fff;font-size:17px;cursor:pointer}
  .zoom-nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;border:none;
            background:rgba(255,255,255,.14);color:#fff;font-size:15px;cursor:pointer}
  .zoom-nav.prev{left:10px}
  .zoom-nav.next{right:10px}
  .zoom-count{position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,.8)}

  /* ── 토스트 ── */
  .toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);z-index:1000;max-width:calc(100% - 32px);
         background:rgba(61,43,31,.95);color:#fff;font-size:13px;line-height:1.5;padding:11px 18px;border-radius:100px;
         opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;text-align:center}
  .toast.on{opacity:1;transform:translate(-50%,0)}

  /* ── 인쇄 전 커피 후원 인터스티셜 (다운로드와 같은 5초 게이트) ── */
  .inter{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:800;align-items:center;justify-content:center;padding:20px}
  .inter.open{display:flex}
  .inter-box{position:relative;background:#fff;border-radius:20px;padding:24px;max-width:400px;width:100%;text-align:center;
             box-shadow:0 20px 60px rgba(0,0,0,.3);animation:fadeUp .35s cubic-bezier(.34,1.56,.64,1)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  .inter-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:none;background:#fff3e0;
               color:#8a7860;font-size:15px;cursor:pointer;line-height:1}
  .inter-h{font-size:13px;color:#8a7860;margin-bottom:14px}
  .inter-coffee{display:block;text-decoration:none;color:inherit;margin-bottom:16px}
  .coffee-header{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:10px}
  .coffee-cup-icon{width:38px;height:38px;object-fit:contain}
  .coffee-title{font-size:15px;font-weight:700;color:#e8734f}
  .coffee-msg{font-size:13px;color:#6b5c4d;margin-bottom:10px}
  .coffee-qr-wrap{width:100%;max-width:190px;margin:0 auto 8px}
  .coffee-qr-img{width:100%;height:auto;display:block;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
  .coffee-instruction{font-size:14px;font-weight:600;color:#3d2b1f}
  .countdown-track{width:100%;height:5px;background:#f3e6d6;border-radius:3px;overflow:hidden;margin-bottom:5px}
  .countdown-fill{height:100%;background:#e8734f;border-radius:3px;animation:cdFill 5s linear forwards}
  @keyframes cdFill{from{width:100%}to{width:0%}}
  .countdown-label{font-size:12px;color:#8a7860;margin-bottom:14px}
  .btn-skip{width:100%;height:48px;border:none;border-radius:100px;background:#c8442a;color:#fff;font-size:15px;font-weight:700;
            opacity:.45;pointer-events:none;transition:opacity .3s}
  .btn-skip.ready{opacity:1;pointer-events:auto}

  @media (min-width:720px){
    .wrap{padding:26px 24px 70px}
    .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
    .grid.solo{grid-template-columns:1fr}
  }

  /* 이 페이지에서 Ctrl+P 해도 A4 그림만 깔끔하게 나오도록 */
  @media print{
    .top,.crumbs,.facts,.acts,.acts-note,.howto,.related,.home-cta,.foot,.zoom,.inter,.toast,h1,.lede,h2,.sheet-body{display:none!important}
    body{background:#fff}
    .wrap{padding:0;max-width:none}
    .grid{display:block}
    .sheet,.single-card{border:none;border-radius:0;box-shadow:none;margin:0}
    .thumb{padding:0}
    .thumb img{width:210mm;height:auto;aspect-ratio:auto;page-break-after:always;break-after:page}
    .zoom-hint{display:none!important}
  }
`;

const SCRIPT = `
function $(id){return document.getElementById(id)}
var toastTimer=null;
function toast(msg){
  var el=$('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el)}
  el.textContent=msg;el.classList.add('on');
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('on')},2800);
}

/* ── 커피 후원 게이트(5초) → 실제 인쇄/저장 ── */
var gateTimer=null,gateRun=null;
function openGate(kind,run){
  gateRun=run;
  var head=$('gateH'),skip=$('skipBtn'),lbl=$('cdLabel'),fill=$('cdFill'),el=$('inter');
  head.textContent=kind+' 준비 중... 😊';
  el.classList.add('open');document.body.style.overflow='hidden';
  skip.classList.remove('ready');skip.textContent='✓ '+kind+' 시작';
  fill.style.animation='none';fill.offsetHeight;
  fill.style.animation='cdFill 5s linear forwards';
  clearInterval(gateTimer);var s=5;
  lbl.textContent=s+'초 후 '+kind+' 가능...';
  gateTimer=setInterval(function(){
    s--;
    if(s<=0){clearInterval(gateTimer);lbl.textContent=kind+' 준비 완료! ✓';skip.classList.add('ready')}
    else{lbl.textContent=s+'초 후 '+kind+' 가능...'}
  },1000);
}
function closeGate(){
  $('inter').classList.remove('open');
  clearInterval(gateTimer);gateRun=null;
  document.body.style.overflow='';
}
function execGate(){
  var run=gateRun;gateRun=null;
  closeGate();
  if(typeof run==='function')run();
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var z=$('zoom');if(z&&z.classList.contains('open'))closeZoom();else closeGate()}});

/* 여러 장을 한 번에 인쇄 — A4 한 장에 한 컷씩 */
function printSheets(srcs){
  if(!srcs||!srcs.length)return;
  var f=$('printFrame');
  if(!f){f=document.createElement('iframe');f.id='printFrame';f.setAttribute('aria-hidden','true');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f)}
  var d=f.contentWindow.document;
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}'+
    'img{display:block;width:210mm;height:auto;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>';
  for(var i=0;i<srcs.length;i++)html+='<img src="'+srcs[i]+'">';
  html+='</body></html>';
  d.open();d.write(html);d.close();
  var fired=false;
  function fire(){if(fired)return;fired=true;try{window.focus();d.defaultView.focus();d.defaultView.print()}catch(e){}}
  try{
    var imgs=d.images||[],left=imgs.length;
    if(!left){setTimeout(fire,250);return}
    for(var k=0;k<imgs.length;k++){
      if(imgs[k].complete){left--;continue}
      imgs[k].onload=imgs[k].onerror=function(){left--;if(left<=0)setTimeout(fire,150)};
    }
    if(left<=0)setTimeout(fire,200);
    setTimeout(fire,4000); /* 이미지가 늦어도 4초 뒤엔 인쇄 대화상자 */
  }catch(e){setTimeout(fire,600)}
}

/* 인쇄: n을 주면 그 장만, 없으면 전체 */
function askPrint(n){
  var list=SHEET_DATA.sheets;
  var srcs=n?[list[n-1].print]:list.map(function(x){return x.print});
  srcs=srcs.filter(Boolean);
  if(!srcs.length)return;
  openGate('인쇄',function(){printSheets(srcs)});
}
/* 저장: n번째 장 원본(PNG) 다운로드 */
function askDownload(n){
  var s=SHEET_DATA.sheets[n-1];
  if(!s||!s.download)return;
  openGate('다운로드',function(){
    var a=document.createElement('a');a.href=s.download;a.rel='noopener';
    document.body.appendChild(a);a.click();a.remove();
    toast(s.n+'번째 장을 저장하고 있어요');
  });
}

/* 공유 복사 — 항상 정식 /p/<id> 주소가 들어간 문구를 복사한다 */
function copyShare(){
  var text=SHEET_DATA.shareText;
  function ok(){toast('공유 문구를 복사했어요 · '+SHEET_DATA.url)}
  function fallback(){
    var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);ta.select();
    var done=false;try{done=document.execCommand('copy')}catch(e){}
    ta.remove();
    if(done)ok();else window.prompt('아래 내용을 복사하세요:',text);
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(ok).catch(fallback);
  }else fallback();
}

/* ── 크게 보기 ── */
var zoomAt=0;
function openZoom(n){
  zoomAt=Math.max(0,Math.min(SHEET_DATA.sheets.length-1,(n||1)-1));
  var z=$('zoom');z.classList.add('open');document.body.style.overflow='hidden';
  renderZoom();
}
function renderZoom(){
  var s=SHEET_DATA.sheets[zoomAt];
  if(!s)return;
  $('zoomImg').src=s.preview||'';
  $('zoomImg').alt=SHEET_DATA.title+' '+(zoomAt+1)+'번째 장';
  $('zoomCount').textContent=(zoomAt+1)+' / '+SHEET_DATA.sheets.length;
  var multi=SHEET_DATA.sheets.length>1;
  $('zoomPrev').style.display=multi?'block':'none';
  $('zoomNext').style.display=multi?'block':'none';
}
function zoomStep(d){
  var n=SHEET_DATA.sheets.length;
  if(n<2)return;
  zoomAt=(zoomAt+d+n)%n;
  renderZoom();
}
function closeZoom(){
  $('zoom').classList.remove('open');
  document.body.style.overflow='';
}
document.addEventListener('keydown',function(e){
  var z=document.getElementById('zoom');
  if(!z||!z.classList.contains('open'))return;
  if(e.key==='ArrowLeft')zoomStep(-1);
  if(e.key==='ArrowRight')zoomStep(1);
});
(function(){
  var z=document.getElementById('zoom');
  if(!z)return;
  var sx=0,sy=0;
  z.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  z.addEventListener('touchend',function(e){
    var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))zoomStep(dx<0?1:-1);
  },{passive:true});
})();
`;

/**
 * /p/<id> — 검색·SNS에서 바로 들어온 방문자가 그 자리에서 인쇄·저장·공유까지 하는 상세 페이지.
 * @param {object} it   enrich()를 거친 항목(url·pages[].preview/print/download/small·shareText 포함)
 * @param {object} opts seo(미리 계산한 SEO 묶음), related(관련 도안), site
 */
export function richPage(it, { seo, related = [], site } = {}) {
  const copy = copyOf(it);
  const s = seo || buildSeo(it, { site });
  const kicker = categoryLabel(it) || copy.ogLabel;
  const series = it.type === 'series' && it.pages.length > 1;
  const pages = it.pages.map((pg, i) => ({ ...pg, n: Number(pg.n) || i + 1, small: pg.small || pg.preview }));

  const sheetData = {
    title: it.title,
    url: it.url,
    shareText: it.shareText || `${it.title}\n\n👉 ${it.url}`,
    sheets: pages.map((pg) => ({
      n: pg.n,
      preview: pg.preview || it.thumb,
      print: pg.print || pg.preview || '',
      download: pg.download || '',
    })),
  };

  const facts = [
    `<li><b>${series ? `${pages.length}장` : '1장'}</b> A4 인쇄</li>`,
    it.category ? `<li><b>${esc(it.category)}</b></li>` : '',
    it.audience ? `<li><b>${esc(it.audience)}</b></li>` : '',
    it.difficulty ? `<li>난이도 ${difficultyDots(it.difficulty)}</li>` : '',
  ].filter(Boolean).join('\n      ');

  const acts = series
    ? `<button class="btn btn-primary" type="button" onclick="askPrint()">🖨 ${pages.length}장 전체 인쇄</button>
        <button class="btn btn-ghost" type="button" onclick="copyShare()">🔗 공유 복사</button>`
    : `<button class="btn btn-primary wide" type="button" onclick="askPrint(1)">🖨 A4로 인쇄</button>
        <button class="btn btn-ghost half" type="button" onclick="askDownload(1)">⬇ 다운로드</button>
        <button class="btn btn-ghost half" type="button" onclick="copyShare()">🔗 공유 복사</button>`;

  const actsNote = series
    ? '장마다 <b>인쇄 · 저장</b> 버튼이 있어요. 전체 인쇄를 누르면 A4 한 장에 한 컷씩 모두 인쇄됩니다.'
    : '인쇄 대화상자에서 용지 <b>A4 · 세로</b>, 여백 <b>없음</b>을 고르면 한 장에 꼭 맞게 나옵니다.';

  const gallery = series
    ? `<section class="sheets" id="sheets">
    <h2>수록된 도안 <span class="cnt">${pages.length}장</span></h2>
    <ol class="grid">
${pages.map((pg, i) => sheetHtml(it, pg, i)).join('\n')}
    </ol>
  </section>`
    : `<section class="sheets" id="sheets">
    <h2>도안 미리보기</h2>
    <div class="single-card">
      <button class="thumb" type="button" onclick="openZoom(1)" aria-label="${esc(it.title)} 크게 보기">
        <img src="${esc(pages[0].preview || it.thumb)}" alt="${esc(s.alt)}" decoding="async">
        <span class="zoom-hint">크게 보기</span>
      </button>
      ${pages[0].story ? `<div class="sheet-body"><p class="story">${esc(pages[0].story)}</p></div>` : ''}
    </div>
  </section>`;

  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(s.ogTitle)}">
<meta property="og:description" content="${esc(s.ogDescription)}">
<meta property="og:image" content="${esc(it.og)}">
<meta property="og:image:alt" content="${esc(s.alt)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(it.url)}">
<meta property="og:site_name" content="color.uncle">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(s.ogTitle)}">
<meta name="twitter:description" content="${esc(s.description)}">
<meta name="twitter:image:alt" content="${esc(s.alt)}">
<link rel="canonical" href="${esc(it.url)}">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#f2a72e">
<link href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${jsonLdScript(s.jsonLd)}</script>
<style>${STYLE}</style>
</head><body>
<header class="top">
  <a class="brand" href="/">color<em>.uncle</em></a>
  <a class="top-link" href="/">전체 도안 보기</a>
</header>
<main class="wrap">
  <nav class="crumbs"><a href="/">홈</a><span>›</span><span>${esc(copy.noun)}</span></nav>
  <h1>${esc(it.title)}</h1>
  <p class="lede">${esc(s.description)}</p>
  <ul class="facts">
      ${facts}
  </ul>
  <div class="acts">
    ${acts}
  </div>
  <p class="acts-note">${actsNote}</p>

  ${gallery}

  <section class="howto">
    <h2>인쇄·저장 안내</h2>
    <ul>
      <li>인쇄: 용지 <b>A4 · 세로</b>, 여백 <b>없음</b>으로 뽑으면 한 장에 꼭 맞습니다.</li>
      <li>저장: <b>저장</b> 버튼을 누르면 고화질 PNG로 내려받아요. 스마트폰은 사진첩에 저장됩니다.</li>
      <li>집에서 바로 쓰는 무료 도안입니다. 가게·교실에서도 자유롭게 인쇄해 쓰세요. (재판매는 안 돼요)</li>
    </ul>
  </section>

  ${relatedHtml(related, copy)}

  <a class="home-cta" href="/">홈에서 ${esc(copy.noun)} 더 보기 →</a>

  <footer class="foot">
    © 2026 color.uncledison.com · <a href="/copyright.html">저작권 안내</a> · <a href="/privacy.html">개인정보처리방침</a>
  </footer>
</main>

<!-- 크게 보기 -->
<div class="zoom" id="zoom" onclick="if(event.target===this)closeZoom()">
  <button class="zoom-close" type="button" onclick="closeZoom()" aria-label="닫기">✕</button>
  <button class="zoom-nav prev" type="button" id="zoomPrev" onclick="zoomStep(-1)" aria-label="이전 장">◀</button>
  <img id="zoomImg" src="" alt="">
  <button class="zoom-nav next" type="button" id="zoomNext" onclick="zoomStep(1)" aria-label="다음 장">▶</button>
  <div class="zoom-count" id="zoomCount"></div>
</div>

<!-- 인쇄·저장 전 커피 후원 안내(5초) -->
<div class="inter" id="inter">
  <div class="inter-box">
    <button class="inter-close" type="button" onclick="closeGate()" aria-label="닫기">✕</button>
    <div class="inter-h" id="gateH">준비 중... 😊</div>
    <a class="inter-coffee" href="https://qr.kakaopay.com/FX9MSRl4N9c402668" target="_blank" rel="noopener">
      <div class="coffee-header">
        <img class="coffee-cup-icon" src="/coffee-cup.png" alt="">
        <div class="coffee-title">커피 한 잔 보내기</div>
      </div>
      <div class="coffee-msg">무료로 프린트해가주셔서 감사해요 ☕</div>
      <div class="coffee-qr-wrap">
        <img class="coffee-qr-img" src="/coffee-qr.png" alt="커피 후원 QR - 눌러서 카카오페이로 이동">
      </div>
      <div class="coffee-instruction">QR찍거나 눌러서 후원하기</div>
    </a>
    <div class="countdown-track"><div class="countdown-fill" id="cdFill"></div></div>
    <div class="countdown-label" id="cdLabel">5초 후 인쇄 가능...</div>
    <button class="btn-skip" type="button" id="skipBtn" onclick="execGate()">✓ 인쇄 시작</button>
  </div>
</div>

<noscript>
  <style>.acts,.acts-note,.mini-acts{display:none!important}</style>
  <p style="padding:0 18px 24px;font-size:13px;color:#8a7860">브라우저에서 자바스크립트를 켜면 인쇄·저장 버튼을 쓸 수 있어요.</p>
</noscript>

<script>
const SHEET_DATA=${jsonSafe(sheetData)};
${SCRIPT}
</script>
</body></html>`;
}
