// pipeline/page.mjs
// 도안 상세 페이지(/p/<id>) 렌더러.
//
// 원칙
// - 검색(구글·네이버)·SNS(핀터레스트·카톡)로 **바로 들어온** 방문자가 한 번 더 클릭하지 않고
//   그 자리에서 미리보기 · 인쇄 · 다운로드 · 공유 복사를 할 수 있어야 한다.
//   (예전엔 썸네일 1장 + '/#id' 보러가기 버튼뿐이라, 들어온 사람이 다시 홈으로 가야 했다.)
// - SEO 메타(<title>·description·og:*·canonical·JSON-LD)와 내부 링크는 기존 것을 그대로 쓰거나 넓힌다.
// - 인쇄·다운로드는 홈과 같은 '3초 커피 후원' 게이트를 거친다(운영 정책 유지). 게이트 없이
//   여러 장을 한 번에 인쇄하거나, 크게 보기로 고화질 원본을 띄우는 길은 두지 않는다.
// - 미리보기는 <canvas> 에 저해상 썸네일만 그린다. DOM 에 도안 <img src> 가 없어야
//   브라우저 일괄 다운로드 확장이 도안을 긁어갈 수 없다(고화질 주소는 게이트 뒤에만 풀림).
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

/** 도안 한 장(장 번호, 이야기, 인쇄·저장 버튼)을 카드로
 *
 * 미리보기는 <img> 대신 <canvas>로 그린다. DOM에 도안 이미지 주소가 <img src>로 남으면
 * 크롬 일괄 다운로드 확장이 그 주소를 전부 긁어가기 때문이다. 캔버스는 저해상 썸네일(w_560)을
 * 받아 화면에만 그리고, 인쇄·저장용 고화질 주소는 게이트(3초) 뒤에만 풀린다.
 * 위에는 투명 shield를 덮어 우클릭·길게 누르기가 이미지에 닿지 않게 한다. */
function sheetHtml(it, pg, index) {
  const label = `${it.title} ${pg.n}번째 장`;
  const story = String(pg.story || '').trim();
  return `      <li class="sheet">
        <div class="thumb">
          <canvas class="pv" data-pv="${index}" width="520" height="735" role="img" aria-label="${esc(label)}"></canvas>
          <span class="shield" aria-hidden="true"></span>
        </div>
        <div class="sheet-body">
          <div class="sheet-head"><span class="num">${esc(pg.n)}</span><span class="sheet-label">${pg.n}번째 장${pg.name ? ` · ${esc(pg.name)}` : ''}</span>${pg.spec ? `<span class="spec">${esc(pg.spec)}</span>` : ''}</div>
          ${story ? `<p class="story">${esc(story)}</p>` : ''}
          <div class="mini-acts">
            <button class="mini" type="button" onclick="askPrint(${pg.n})">🖨 인쇄</button>${it.cardSet ? '' : `<button class="mini primary" type="button" onclick="askDownload(${pg.n})">⬇ 저장</button>`}
          </div>
        </div>
      </li>`;
}

const STYLE = `
  :root{--ink:#3d2b1f;--ink-2:#5c4a38;--ink-3:#8a7860;--warm:#fff7e6;--coral:#f2a72e;--accent:#c8442a;
        --bg:#faf7f3;--card:#fff;--border:rgba(61,43,31,.12)}
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'Noto Sans KR',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:var(--bg);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden;
       -webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-touch-callout:none}
  img,canvas{display:block;max-width:100%;-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;user-drag:none;-webkit-touch-callout:none}
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
  .thumb{position:relative;display:block;width:100%;background:#fff;overflow:hidden}
  .thumb canvas{width:100%;height:auto;display:block;background:#fff;-webkit-user-select:none;user-select:none}
  /* 투명 방어막 — 우클릭·드래그·길게 누르기가 캔버스에 직접 닿지 않는다 */
  .shield{position:absolute;inset:0;z-index:2;background:transparent;-webkit-touch-callout:none;user-select:none}
  .sheet-body{padding:12px 15px 15px}
  .sheet-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .num{flex:none;width:22px;height:22px;border-radius:50%;background:var(--warm);color:var(--accent);
       font-size:12px;font-weight:700;display:grid;place-items:center}
  .sheet-label{font-size:12px;font-weight:700;color:var(--ink-3);letter-spacing:.02em}
  .spec{margin-left:auto;font-size:11px;font-weight:600;color:var(--ink-3);background:var(--warm);
        border-radius:100px;padding:2px 8px;white-space:nowrap}
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

  /* ── 토스트 ── */
  .toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);z-index:1000;max-width:calc(100% - 32px);
         background:rgba(61,43,31,.95);color:#fff;font-size:13px;line-height:1.5;padding:11px 18px;border-radius:100px;
         opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;text-align:center}
  .toast.on{opacity:1;transform:translate(-50%,0)}

  /* ── 인쇄 전 커피 후원 인터스티셜 (다운로드와 같은 3초 게이트) ── */
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
  .countdown-fill{height:100%;background:#e8734f;border-radius:3px;animation:cdFill 3s linear forwards}
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

  /* Ctrl+P 로는 아무것도 인쇄되지 않는다 — 도안은 장마다 [인쇄] 버튼(3초 게이트)으로만 나간다.
     (게이트를 거친 인쇄는 숨은 iframe 문서 안에서 이뤄지므로 이 규칙과 무관하다) */
  .print-only{display:none}
  @media print{
    html,body{background:#fff}
    body *{visibility:hidden!important}
    .print-only,.print-only *{visibility:visible!important}
    .print-only{display:block!important;position:absolute;left:0;top:0;width:100%;padding:40px 24px;
                font-family:'Noto Sans KR',sans-serif;color:#3d2b1f;text-align:center;line-height:1.9}
    .print-only b{color:#c8442a}
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

/* ── 커피 후원 게이트(3초) → 실제 인쇄/저장 ── */
var gateTimer=null,gateRun=null;
function openGate(kind,run){
  gateRun=run;
  var head=$('gateH'),skip=$('skipBtn'),lbl=$('cdLabel'),fill=$('cdFill'),el=$('inter');
  head.textContent=kind+' 준비 중... 😊';
  el.classList.add('open');document.body.style.overflow='hidden';
  skip.classList.remove('ready');skip.textContent='✓ '+kind+' 시작';
  fill.style.animation='none';fill.offsetHeight;
  fill.style.animation='cdFill 3s linear forwards';
  clearInterval(gateTimer);var s=3;
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
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeGate()});

/* ── 도안 미리보기: 캔버스에 저해상 썸네일(w_560)만 그린다 ──
   화면에는 그림이 그대로 보이지만 DOM 에는 도안 이미지 주소(<img src>)가 하나도 없다.
   일괄 다운로드 확장은 <img>/CSS 배경 주소를 긁으므로 잡을 것이 없다. */
function paintPv(cv,im){
  var w=cv.width,h=cv.height,ctx=cv.getContext('2d');
  if(!ctx)return;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  var s=Math.min(w/im.width,h/im.height);
  var iw=im.width*s,ih=im.height*s;
  ctx.drawImage(im,(w-iw)/2,(h-ih)/2,iw,ih);
  /* 가운데 흐린 미리보기 워터마크 — 캡처만으로 완성본을 쓰기 어렵게 */
  ctx.save();ctx.globalAlpha=.12;ctx.fillStyle='#3d2b1f';
  ctx.font='bold '+Math.round(w/24)+'px -apple-system,system-ui,sans-serif';
  ctx.translate(w/2,h/2);ctx.rotate(-Math.PI/6);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('미리보기 · color.uncle',0,0);
  ctx.restore();
}
function drawPv(cv){
  if(!cv||cv.getAttribute('data-drawn'))return;
  var url=PV[+cv.getAttribute('data-pv')];
  if(!url)return;
  cv.setAttribute('data-drawn','1');
  var im=new Image();
  im.onload=function(){paintPv(cv,im)};
  im.onerror=function(){cv.setAttribute('data-error','1')};
  im.src=url;
}
(function hydratePv(){
  var list=document.querySelectorAll('canvas.pv[data-pv]'),i;
  if('IntersectionObserver' in window&&list.length>2){
    var io=new IntersectionObserver(function(es){
      for(var k=0;k<es.length;k++){if(es[k].isIntersecting){io.unobserve(es[k].target);drawPv(es[k].target)}}
    },{rootMargin:'500px 0px'});
    for(i=0;i<list.length;i++)io.observe(list[i]);
  }else{
    for(i=0;i<list.length;i++)drawPv(list[i]);
  }
})();

/* ── 게이트가 끝난 뒤에만 풀리는 고화질 주소(인쇄·저장) ──
   HTML 에는 base64 한 줄로만 실려 있고, 누르기 전에는 풀지 않는다. */
var RES_CACHE=null;
function unlockUrls(){
  if(RES_CACHE)return RES_CACHE;
  var raw=atob(RES),json=raw;
  try{json=decodeURIComponent(escape(raw))}catch(e){}
  RES_CACHE=JSON.parse(json);
  return RES_CACHE;
}

/* ── 우클릭·드래그·길게 누르기로 이미지 저장하지 못하게 ── */
document.addEventListener('contextmenu',function(e){e.preventDefault();return false},true);
document.addEventListener('dragstart',function(e){e.preventDefault();return false},true);
document.addEventListener('selectstart',function(e){
  var t=e.target;
  if(t&&(t.tagName==='CANVAS'||t.className==='shield'))e.preventDefault();
});

/* 한 장만 인쇄 — 숨은 iframe 문서에 그 장만 써서 인쇄 대화상자를 띄운다. */
function printSheet(src){
  if(!src)return;
  var f=$('printFrame');
  if(!f){f=document.createElement('iframe');f.id='printFrame';f.setAttribute('aria-hidden','true');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.appendChild(f)}
  var d=f.contentWindow.document;
  d.open();
  d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}'+
    'img{display:block;width:210mm;height:auto}</style></head><body><img src="'+src+'" onload="setTimeout(function(){window.focus();window.print()},200)"></body></html>');
  d.close();
}

/* 인쇄: n번째 장 한 장만 — 여러 장을 모아 뽑는 길은 두지 않는다 */
function askPrint(n){
  var idx=(Number(n)||1)-1;
  if(idx<0)return;
  openGate('인쇄',function(){
    var s=unlockUrls()[idx];
    if(s&&s.print)printSheet(s.print);
    else toast('인쇄할 장을 찾지 못했어요');
  });
}
/* 저장: n번째 장 원본(PNG) 한 장만 내려받기 */
function askDownload(n){
  var idx=(Number(n)||1)-1;
  if(idx<0)return;
  openGate('다운로드',function(){
    var s=unlockUrls()[idx];
    if(!s||!s.download){toast('저장할 장을 찾지 못했어요');return}
    var a=document.createElement('a');a.href=s.download;a.rel='noopener';
    document.body.appendChild(a);a.click();a.remove();
    toast((idx+1)+'번째 장을 저장하고 있어요');
  });
}

/* 카드·편지지 세트: A4 4장짜리 PDF 한 부만 내려받기(같은 3초 게이트를 거친다) */
function askSetPdf(){
  openGate('PDF 저장',function(){
    var s=unlockUrls()[0];
    if(!s||!s.set){toast('세트 PDF를 찾지 못했어요');return}
    var a=document.createElement('a');a.href=s.set;a.rel='noopener';
    if(s.setName)a.setAttribute('download',s.setName);
    document.body.appendChild(a);a.click();a.remove();
    toast('A4 PDF 4장을 저장하고 있어요');
  });
}

/* 공유 복사 — 주소창·링크 입력칸에 그대로 붙여넣을 수 있게 '깨끗한 주소 하나'만 복사한다 */
function copyShare(){
  var url=SHEET_DATA.url;
  function ok(){toast('링크를 복사했어요 · '+url)}
  function fallback(){
    var ta=document.createElement('textarea');ta.value=url;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);ta.select();
    var done=false;try{done=document.execCommand('copy')}catch(e){}
    ta.remove();
    if(done)ok();else window.prompt('아래 주소를 복사하세요:',url);
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(ok).catch(fallback);
  }else fallback();
}
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

  /* 화면에 쓰는 것은 제목·주소·장 번호뿐. 인쇄·저장용 고화질 주소는 아래 RES(base64)에만 들어간다. */
  const sheetData = {
    title: it.title,
    url: it.url,
    sheets: pages.map((pg) => ({ n: pg.n })),
  };

  /* 미리보기용 저해상 썸네일(w_560) 주소 — 캔버스에 그리는 용도로만 JS 배열에 담는다 */
  const previews = pages.map((pg) => pg.small || pg.preview || it.thumb);

  /* 인쇄·저장용 고화질 주소 — HTML 에는 base64 한 줄로만 실린다(게이트가 끝나야 풀림) */
  const reserved = pages.map((pg) => ({
    print: pg.print || pg.preview || '',
    download: pg.download || '',
    ...(it.cardSet ? { set: it.setPdf || '', setName: it.downloadName || '' } : {}),
  }));
  const RES_B64 = Buffer.from(JSON.stringify(reserved), 'utf8').toString('base64');

  const facts = [
    `<li><b>${series ? `${pages.length}장` : '1장'}</b> A4 인쇄</li>`,
    it.category ? `<li><b>${esc(it.category)}</b></li>` : '',
    it.audience ? `<li><b>${esc(it.audience)}</b></li>` : '',
    it.difficulty ? `<li>난이도 ${difficultyDots(it.difficulty)}</li>` : '',
  ].filter(Boolean).join('\n      ');

  const acts = it.cardSet
    ? `<button class="btn btn-primary wide" type="button" onclick="askSetPdf()">📄 A4 PDF ${pages.length}장 한 번에 받기</button>
        <button class="btn btn-ghost half" type="button" onclick="copyShare()">🔗 링크 복사</button>`
    : series
      ? `<button class="btn btn-ghost" type="button" onclick="copyShare()">🔗 링크 복사</button>`
      : `<button class="btn btn-primary wide" type="button" onclick="askPrint(1)">🖨 A4로 인쇄</button>
        <button class="btn btn-ghost half" type="button" onclick="askDownload(1)">⬇ 다운로드</button>
        <button class="btn btn-ghost half" type="button" onclick="copyShare()">🔗 링크 복사</button>`;

  const actsNote = it.cardSet
    ? 'PDF 한 부에 <b>카드 · 카드 봉투 · 편지지 · 편지 봉투</b>가 담겨 있어요. 한 장씩 바로 뽑고 싶을 땐 아래 카드의 <b>인쇄</b> 버튼을 누르세요. (버튼을 누르면 3초 후원 안내가 먼저 나옵니다)'
    : series
      ? '장마다 <b>인쇄 · 저장</b> 버튼으로 <b>한 장씩</b> 인쇄·저장해 주세요. (버튼을 누르면 3초 후원 안내가 먼저 나옵니다)'
      : '인쇄 대화상자에서 용지 <b>A4 · 세로</b>, 여백 <b>없음</b>을 고르면 한 장에 꼭 맞게 나옵니다. 저장은 고화질 PNG 한 장으로 내려받아요.';

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
      <div class="thumb">
        <canvas class="pv" data-pv="0" width="520" height="735" role="img" aria-label="${esc(s.alt)}"></canvas>
        <span class="shield" aria-hidden="true"></span>
      </div>
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
<meta name="twitter:image" content="${esc(it.og)}">
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
      ${it.cardSet && it.sizes ? `<li>한 부 구성: <b>${esc(it.sizes)}</b></li>` : ''}
      <li>인쇄: 용지 <b>A4 · 세로</b>, 여백 <b>없음</b>으로 뽑으면 한 장에 꼭 맞습니다.</li>
      ${it.cardSet
        ? `<li>저장: <b>A4 PDF ${pages.length}장 한 번에 받기</b> 버튼을 누르면 PDF 한 부(4칸)를 받아요. 1=카드, 2=카드 봉투, 3=편지지, 4=편지 봉투 순서입니다.</li>
      <li>4장 모두 <b>실선은 자르는 선</b>, <b>점선은 접는 선</b>이에요. 봉투는 점선을 따라 접어 양 날개 안쪽에 풀칠해 붙이면 됩니다.</li>`
        : `<li>저장: <b>저장</b> 버튼을 누르면 그 장만 고화질 PNG로 내려받아요. 스마트폰은 사진첩에 저장됩니다.</li>
      <li>여러 장을 쓰실 때는 장마다 <b>인쇄</b> 버튼을 눌러 한 장씩 뽑으시면 됩니다.</li>`}
      <li>집에서 바로 쓰는 무료 도안입니다. 가게·교실에서도 자유롭게 인쇄해 쓰세요. (재판매는 안 돼요)</li>
    </ul>
  </section>

  ${relatedHtml(related, copy)}

  <a class="home-cta" href="/">홈에서 ${esc(copy.noun)} 더 보기 →</a>

  <footer class="foot">
    © 2026 color.uncledison.com · <a href="/copyright.html">저작권 안내</a> · <a href="/privacy.html">개인정보처리방침</a>
  </footer>
</main>

<!-- Ctrl+P 로는 아무것도 나가지 않고 이 안내만 인쇄된다 -->
<div class="print-only">
  <p><b>도안은 한 장씩 인쇄해 주세요</b></p>
  <p>각 도안 카드의 <b>인쇄</b> 버튼을 누르면 그 장만 A4로 인쇄됩니다.</p>
</div>

<!-- 인쇄·저장 전 커피 후원 안내(3초) -->
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
    <div class="countdown-label" id="cdLabel">3초 후 인쇄 가능...</div>
    <button class="btn-skip" type="button" id="skipBtn" onclick="execGate()">✓ 인쇄 시작</button>
  </div>
</div>

<noscript>
  <style>.acts,.acts-note,.mini-acts{display:none!important}</style>
  <p style="padding:0 18px 24px;font-size:13px;color:#8a7860">브라우저에서 자바스크립트를 켜면 인쇄·저장 버튼을 쓸 수 있어요.</p>
</noscript>

<script>
const SHEET_DATA=${jsonSafe(sheetData)};
const PV=${jsonSafe(previews)};
const RES="${RES_B64}";
${SCRIPT}
</script>
</body></html>`;
}
