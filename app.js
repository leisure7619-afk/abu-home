/* 阿布之家 v2 — 照片從 Google 雲端硬碟來（Apps Script API） */
const API_URL = (window.ABU_CONFIG && window.ABU_CONFIG.API_URL || '').trim();

/* ---------------- 資料 ---------------- */
const FACES = { normal:'face_65', happy:['face_60','face_66','face_68'], sleep:'face_62', look:['face_143','face_142'] };
const SAMPLE = [
  ['65','靠牆坐好，拍照專用笑臉'],['60','笑到看得見牙齒'],['143','抬頭等零食中'],['163','河邊，一家人'],
  ['41','街上散步，胸背帶很帥'],['49','斑馬線前乖乖等'],['53','準備出門散步囉'],['61','在家陪坐'],
  ['62','地板涼涼的，睡一下'],['66','鏡頭太近了啦'],['67','趴著等人回家'],['68','坐在椅子上當大王'],
  ['69','公園散步'],['86','桌上的雞肉好香（只是看看）'],['121','小木屋前一起乘涼'],['122','小木屋前全員到齊'],
  ['124','有我的份嗎？'],['126','草地上散步'],['142','星星毯子上的阿布'],
].map(([n,cap],i)=>({id:'s'+n, cap, by:'', t:i+1, url:'img/sample/'+n+'.jpg', sample:true, cat:(n==='86'||n==='124')?'美食':''}));
const PASS_COST = 2, PASS_MIN = 10;    // 2 片餅乾：相簿、日常的照片和影片全部看 10 分鐘
const REEL_COST = 2;                   // 2 片餅乾解鎖一支短片（解鎖後可以一直重看）
const LEVEL_GIFT = 3;                  // 好感升一級，阿布送 3 片餅乾
/* 阿布最愛的餅乾：牛肉、羊肉、雞肉三種口味 */
const SHAPES = ['strawberry','bear','bone','lion','apple','rabbit','grape','monkey'].map(n=>'img/biscuit/'+n+'.png');
const FLAVORS = [{n:'牛肉',c:'#9C5A2E'},{n:'羊肉',c:'#BF8543'},{n:'雞肉',c:'#DDB067'}];
const NEW_DAYS = 7;
const FREE_OPEN = 4;
const LINES = {
  idle:['汪！','摸摸頭～','今天要去散步嗎？','（歪頭）','有零食嗎？','我乖乖的喔','尾巴搖搖搖'],
  pet:['嘿嘿～','再摸一下！','好舒服','汪汪！','最喜歡你了','耳朵後面也要'],
  tooMuch:['好了啦～','毛要被摸光了','讓我喘口氣'],
  eat:['咔滋咔滋！','餅乾好香！','還有嗎？','謝謝！汪！'],
  noBone:['沒有餅乾了…','去玩小遊戲賺餅乾吧！'],
  wake:['嗯？我沒睡著','汪？誰叫我'],
};
const pick = a => a[Math.floor(Math.random()*a.length)];
const face = k => 'img/'+k+'.jpg';
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* 照片網址：雲端硬碟的照片用縮圖服務，載入失敗自動換備用網址 */
function purl(p,w=800){ return p.url || `https://lh3.googleusercontent.com/d/${p.id}=w${w}`; }
function pimg(p,w,attrs=''){ return `<img src="${purl(p,w)}" ${p.sample?'':`data-fid="${esc(p.id)}" data-w="${w}"`} ${attrs}>`; }
document.addEventListener('error',e=>{
  const t=e.target; if(t.tagName!=='IMG'||!t.dataset.fid||t.dataset.fb) return;
  t.dataset.fb='1'; t.src=`https://drive.google.com/thumbnail?id=${t.dataset.fid}&sz=w${t.dataset.w}`;
},true);

/* 飛機耳照片：AI 從雲端的照片裡找出阿布開飛機耳的，記下頭的位置；摸頭時裁出頭部輪流出現 */
const EARS_LOCAL={src:'img/face_ears.jpg',size:'100% 100%',pos:'50% 50%'};
let EARS=[], earsKey=null;
function earCrop(b,W,H){
  if(!W||!H) return null;
  const x0=b[1]/1000*W, x1=b[3]/1000*W, y0=b[0]/1000*H, y1=b[2]/1000*H;
  if(Math.max(x1-x0,y1-y0)<Math.min(W,H)*.18) return null;   // 頭太小（拍得太遠），放大會糊，不用
  const S=Math.min(Math.max(x1-x0,y1-y0)*1.35,W,H);          // 正方形，頭加一圈留白，耳朵才不會被圓框切掉
  const L=Math.max(0,Math.min(W-S,(x0+x1)/2-S/2)), T=Math.max(0,Math.min(H-S,(y0+y1)/2-S/2));
  return { size:`${W/S*100}% ${H/S*100}%`, pos:`${W>S+1? L/(W-S)*100:50}% ${H>S+1? T/(H-S)*100:50}%` };
}
function loadEars(){
  const list=PH.filter(p=>!isVid(p)&&Array.isArray(p.ears)&&p.ears.length===4);
  const key=list.map(p=>p.id).join();
  if(key===earsKey) return; earsKey=key;
  const got=[]; EARS=got;
  { const im=new Image(); im.onload=()=>got.unshift(EARS_LOCAL); im.src=EARS_LOCAL.src; }   // 圖真的載得到才用，不會出現空白圓圈
  list.sort(()=>Math.random()-.5).slice(0,12).forEach(p=>{     // 每次隨機挑 12 張先載好，摸的時候才不會等
    const im=new Image();
    im.onload=()=>{ const c=earCrop(p.ears,im.naturalWidth,im.naturalHeight); if(c) got.push(Object.assign({src:im.src},c)); };
    im.onerror=()=>{ if(!im.dataset.fb){ im.dataset.fb='1'; im.src=`https://drive.google.com/thumbnail?id=${p.id}&sz=w800`; } };
    im.src=purl(p,800);
  });
}

/* ---------------- 存檔 ---------------- */
const KEY='abu-home-v2';
let S = { bones:3, love:0, unlocked:[], seen:[], sound:true, best:{}, me:'' };
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
(function(){
  const d=lsGet(KEY);
  if(d) S=Object.assign(S,d);
  else { const old=lsGet('abu-home-v1'); if(old){ S.bones=old.bones??S.bones; S.love=old.love||0; S.best=old.best||{}; S.sound=old.sound!==false; } }
})();
function save(){ lsSet(KEY,S); }

/* ---------------- 照片清單 ---------------- */
const normCat = p => { if(['吃飼料','美食地圖','吃飯'].includes(p.cat)) p.cat='美食'; return p; };
const uniq = list => { const s=new Set(); return list.filter(p=>p&&p.id&&!s.has(p.id)&&s.add(p.id)); };
let FEEDS = lsGet('abu-feeds')||[];
let PH = [], CONFIG = { lostLink:'', lostNote:'', birthday:'', meals:'', bathDays:'' }, PH_STATE = API_URL? 'loading':'sample';
(function(){
  if(!API_URL){ PH=SAMPLE; return; }
  const c=lsGet('abu-photos');
  if(c&&c.photos&&c.photos.length){ PH=uniq(c.photos).map(normCat); CONFIG=c.config||CONFIG; PH_STATE='cached'; }
})();
const pool = () => PH.length? PH: SAMPLE;
const isRecent = p => !p.sample && p.t && Date.now()-p.t < NEW_DAYS*864e5;
const isVid = p => Array.isArray(p.v);                                   // 影片：p.v = [秒數, 寬, 高]
const vdur = p => { const d=Math.round((p.v&&p.v[0])||0); return d? `${Math.floor(d/60)}:${String(d%60).padStart(2,'0')}` : ''; };
const passOn = () => (S.passLeft||0) > 0;
const isOpen = p => passOn() || S.unlocked.includes(p.id) || (!isVid(p) && (['美食','洗澡','上廁所'].includes(p.cat) || isRecent(p)));
const photosOnly = () => pool().filter(p=>!isVid(p));
const openPhotos = () => { const o=photosOnly().filter(isOpen); return o.length? o: photosOnly().slice(0,FREE_OPEN); };
function ensureFree(){
  const list=photosOnly(); let n=list.filter(isOpen).length;
  for(const p of list){ if(n>=FREE_OPEN) break; if(!isOpen(p)){ S.unlocked.push(p.id); n++; } }
  save();
}
async function loadPhotos(fresh){
  if(!API_URL) { ensureFree(); return; }
  try{
    const r=await fetch(API_URL+'?action=list'+(fresh?'&fresh=1':''));
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'讀取失敗');
    PH=uniq(j.photos||[]).map(normCat); CONFIG=Object.assign({lostLink:'',lostNote:'',birthday:'',meals:'',bathDays:''},j.config||{}); PH_STATE='ok';
    if(j.feeds){ FEEDS=j.feeds; lsSet('abu-feeds',FEEDS); }
    if(Array.isArray(j.reels)){ REELS=j.reels; REELS_ON_SERVER=true; lsSet('abu-reels',REELS); } else REELS_ON_SERVER=false;
    if(j.needs) setNeeds(j.needs);
    if(current==='home'){ lastAgeLv=0; renderLove(); }            // 照片到了，換上這個年紀的阿布
    lsSet('abu-photos',{photos:PH,config:CONFIG});
    loadEars();
  }catch(e){
    PH_STATE = PH.length? 'cached':'fail';
    if(!PH.length) toast('連不上雲端相簿，先用內建照片');
  }
  ensureFree(); renderTop();
  if(current==='album'||current==='food') go(current,true);
  ensureTodayReel();
  if(current==='home') renderLost();
}
async function api(body){
  const r=await fetch(API_URL,{method:'POST',body:JSON.stringify(body)});
  const j=await r.json(); if(!j.ok) throw new Error(j.error||'失敗'); return j;
}

/* ---------------- 聲音（WebAudio 合成） ---------------- */
let AC=null;
function ac(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(AC&&AC.state==='suspended') AC.resume(); return AC; }
function tone(freq,dur,type='sine',vol=.15,slide=0,delay=0){
  if(!S.sound) return; const c=ac(); if(!c) return; const t=c.currentTime+delay;
  const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(freq,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t+dur);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+.015); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t+dur+.02);
}
function bark(n=1){
  if(!S.sound) return; const c=ac(); if(!c) return;
  for(let i=0;i<n;i++){
    const t=c.currentTime+i*.2;
    const o=c.createOscillator(), f=c.createBiquadFilter(), g=c.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(520,t); o.frequency.exponentialRampToValueAtTime(900,t+.03); o.frequency.exponentialRampToValueAtTime(330,t+.14);
    f.type='bandpass'; f.frequency.value=1100; f.Q.value=1.2;
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.5,t+.02); g.gain.exponentialRampToValueAtTime(.0001,t+.17);
    o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t+.2);
  }
}
const sfx = {
  pop:()=>tone(660,.08,'triangle',.12,300),
  good:()=>{tone(784,.09,'triangle',.14);tone(1047,.12,'triangle',.14,0,.08);},
  bad:()=>tone(220,.25,'square',.08,-80),
  flip:()=>tone(500,.05,'triangle',.08,200),
  win:()=>{[523,659,784,1047].forEach((f,i)=>tone(f,.18,'triangle',.14,0,i*.11));},
  crunch:()=>{for(let i=0;i<3;i++) tone(180+Math.random()*80,.05,'square',.06,-60,i*.09);},
};

/* ---------------- 共用 UI ---------------- */
const $=s=>document.querySelector(s);
const main=$('#main'), app=$('#app');
function h(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function renderTop(){
  $('#bones').textContent=S.bones;
  $('#soundBtn use').setAttribute('href',S.sound?'#i-sound-on':'#i-sound-off');
  $('#findBtn').classList.toggle('alert',!!CONFIG.lostLink);
}
$('#soundBtn').onclick=()=>{ S.sound=!S.sound; save(); renderTop(); if(S.sound) bark(1); };
$('#findBtn').onclick=()=>{ sfx.pop(); findAbu(); };
function toast(msg,ms=2000){ const t=h(`<div class="toast">${esc(msg)}</div>`); app.appendChild(t); setTimeout(()=>t.remove(),ms); }
function modal(inner,onClose){
  const o=h(`<div class="overlay"><div class="dialog">${inner}</div></div>`);
  app.appendChild(o);
  let closed=false;
  const close=()=>{ if(closed) return; closed=true; o.remove(); onClose&&onClose(); };
  o.addEventListener('click',e=>{ if(e.target===o && !o.dataset.busy) close(); });
  o.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  return {el:o,close};
}
function addBones(n){ S.bones+=n; save(); renderTop(); }
function petLove(n){                                          // 摸頭的好感：肚子餓或口渴時只有一半
  if(!needy()) return addLove(n);
  S.halfAcc=(S.halfAcc||0)+n/2; const k=Math.floor(S.halfAcc); S.halfAcc-=k; if(k) addLove(k); else save();
}
function addLove(n){
  const before=lvOf(S.love); S.love+=n; const up=lvOf(S.love)-before;
  save(); if(current==='home') renderLove();
  if(up>0){ const g=LEVEL_GIFT*up, L=levelInfo(); addBones(g); setTimeout(()=>{ sfx.win(); toast(L.lv<=AGE_LV? `阿布長大了！Lv.${L.lv}「${L.title}」，送你 ${g} 片餅乾` : `升到 Lv.${L.lv}！阿布送你 ${g} 片餅乾`,2800); },400); }
}
function fmtDate(t){ if(!t) return ''; const d=new Date(t); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`; }


/* 「你是誰」只問一次：記住之後只顯示名字，要換人再點「不是我」 */
function whoField(id,ph){
  if(!S.me) return `<label class="field">你是誰（只要填一次）<input id="${id}" maxlength="30" placeholder="${ph}"></label>`;
  return `<div class="whoami" data-for="${id}"><span>以 <b>${esc(S.me)}</b> 的名字</span><button type="button" class="linkbtn">不是我</button>
    <label class="field" hidden>你是誰<input id="${id}" maxlength="30" value="${esc(S.me)}" placeholder="${ph}"></label></div>`;
}
function bindWho(root){
  root.querySelectorAll('.whoami').forEach(w=>{
    w.querySelector('.linkbtn').onclick=()=>{ const f=w.querySelector('.field'); f.hidden=false; w.querySelector('span').hidden=true; w.querySelector('.linkbtn').hidden=true; const i=f.querySelector('input'); i.value=''; i.focus(); };
  });
}

/* ---------------- 找阿布 ---------------- */
const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1) || /Macintosh/.test(navigator.userAgent);
function findAbu(){
  const lost = CONFIG.lostLink;
  const lostBlock = lost? `<a class="btn danger" href="${esc(lost)}" target="_blank" rel="noopener">看阿布現在的位置</a>${CONFIG.lostNote?`<p>${esc(CONFIG.lostNote)}</p>`:''}`:'';
  const apple = `<a class="btn${lost?' ghost':''}" href="findmy://items">打開「尋找」App</a>
    <p class="how"><b>第一次用：</b>請阿布的主人在「尋找」App →「物品」→ 阿布 →「共享此 AirTag」把你加進去（最多 5 人），之後就能在「物品」裡看到阿布。</p>`;
  const other = `<p class="how">阿布戴的是 AirTag，平常只有 iPhone 的「尋找」App 看得到位置。<br><b>阿布走失時</b>，家人會把「分享物品位置」連結貼到相簿試算表，這裡就會出現紅色的「看阿布現在的位置」按鈕，任何手機都能點開。</p>`;
  modal(`<img class="face-img" src="${face(lost?'face_143':'face_65')}" alt=""><h3>${lost?'阿布走失中！':'阿布在哪裡？'}</h3>${lostBlock}${isApple?apple:other}<button class="btn ghost" data-close>關閉</button>`);
}
function renderLost(){
  const box=$('#lostBox'); if(!box) return;
  box.innerHTML='';
  if(!CONFIG.lostLink) return;
  const b=h(`<button class="lost"><svg><use href="#i-pin-w"/></svg><span>阿布走失中！點這裡看位置${CONFIG.lostNote?`<small>${esc(CONFIG.lostNote)}</small>`:''}</span></button>`);
  b.onclick=findAbu; box.appendChild(b);
}

/* ---------------- 導覽 ---------------- */
let current='home', cleanup=null, backTo='games';
function go(tab,keepScroll){
  const y=main.scrollTop;
  if(cleanup){ cleanup(); cleanup=null; }
  current=tab;
  if(tab==='games'||tab==='food') backTo=tab;
  const navTab={memory:backTo,catch:backTo,puzzle:backTo,bowl:backTo,quiz:backTo,car:backTo,walk:backTo,stairs:backTo}[tab]||tab;
  document.querySelectorAll('nav button').forEach(b=>b.toggleAttribute('aria-current',false));
  const nb=document.querySelector(`nav button[data-tab="${navTab}"]`); if(nb) nb.setAttribute('aria-current','page');
  main.innerHTML='';
  ({home:Home,games:Games,album:Album,food:Food,memory:Memory,catch:Catch,puzzle:Puzzle,bowl:Bowl,quiz:Quiz,car:Car,walk:Walk,stairs:Stairs})[tab]();
  main.scrollTop=keepScroll? y: 0;
  renderPass();
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{ sfx.pop(); go(b.dataset.tab); });

/* 去散步：只挑散步的照片（AI 寫的回憶裡有散步、公園、草地、牽繩…），不夠就用內建的散步照 */
const WALK_WORDS=/散步|公園|草地|草皮|河濱|河邊|步道|街|馬路|斑馬線|出門|戶外|牽繩|胸背|溜狗|走路|山|海邊|沙灘/;
function walkPhotos(){
  const mine=pool().filter(p=>!isVid(p)&&!p.sample&&isOpen(p)&&WALK_WORDS.test(p.cap||''));
  if(mine.length>=3) return mine;
  const all=pool().filter(p=>!isVid(p)&&!p.sample&&WALK_WORDS.test(p.cap||''));
  if(all.length>=3) return all;                                   // 散步照不管解鎖與否都能在這裡看到
  return mine.concat(all,SAMPLE.filter(p=>['s41','s49','s53','s69','s126'].includes(p.id)));
}
/* 阿布的飢餓、口渴、想尿尿：全家共用（存在雲端），12 小時從飽到餓、8 小時從不渴到很渴、10 小時憋到滿（吃喝會更快） */
const NEED_EAT=12*3600e3, NEED_DRINK=8*3600e3, PEE_SHARE=.7;
let NEEDS=lsGet('abu-needs')||{f:1,ft:Date.now(),fb:'',w:1,wt:Date.now(),wb:''};
const fullNow=()=>Math.max(0,Math.min(1,NEEDS.f-(Date.now()-NEEDS.ft)/NEED_EAT));
const waterNow=()=>Math.max(0,Math.min(1,NEEDS.w-(Date.now()-NEEDS.wt)/NEED_DRINK));
/* 尿尿＝水分慢慢變少時，70% 轉成尿（水喝完了就不再增加） */
const waterAt=t=>Math.max(0,NEEDS.w-Math.max(0,t-NEEDS.wt)/NEED_DRINK);
const peeNow=()=>{ const now=Date.now(), pt=NEEDS.pt||now; return Math.max(0,Math.min(1,(NEEDS.p||0)+PEE_SHARE*(waterAt(pt)-waterAt(now)))); };
const hungry=()=>fullNow()<.25, thirsty=()=>waterNow()<.25, mustPee=()=>peeNow()>=.75, needy=()=>hungry()||thirsty()||mustPee();
let careBusy=0;
/* 還有自己按的沒回來時，先別被較舊的雲端資料蓋掉 */
function setNeeds(n){ if(n&&typeof n.f==='number'&&!careBusy){ NEEDS=n; lsSet('abu-needs',NEEDS); if(current==='home') renderNeeds(); } }
async function careAbu(kind){                                 // 先在手機上更新，再告訴雲端（全家同步）
  const now=Date.now();
  if(kind==='walk'){ NEEDS=Object.assign({},NEEDS,{p:0,pt:now,pb:S.me||''}); }
  else {
    if(kind==='eat'){ NEEDS=Object.assign({},NEEDS,{f:Math.min(1,fullNow()+.3),ft:now,fb:S.me||''}); }
    else { NEEDS=Object.assign({},NEEDS,{p:peeNow(),pt:now,w:Math.min(1,waterNow()+.1),wt:now,wb:S.me||''}); }   // 喝一次 +10%
  }
  lsSet('abu-needs',NEEDS); renderNeeds();
  if(API_URL){ careBusy++; let j=null; try{ j=await api({action:kind,by:S.me||''}); }catch(e){} careBusy--; if(j) setNeeds(j.needs); }
}
const ago=t=>{ const m=Math.round((Date.now()-t)/60000); return m<1?'剛剛': m<60? `${m} 分鐘前` : m<1440? `${Math.round(m/60)} 小時前` : `${Math.round(m/1440)} 天前`; };
function renderNeeds(){
  const box=$('#needs'); if(!box) return;
  const f=fullNow(), w=waterNow();
  const set=(id,v)=>{ const el=box.querySelector(id); el.querySelector('i').style.width=(v*100)+'%'; el.classList.toggle('low',v<.25); el.classList.toggle('mid',v>=.25&&v<.5); };
  set('#needF',f); set('#needW',w);
  const p=peeNow(), pe=box.querySelector('#needP');               // 尿尿條是越滿越急
  pe.querySelector('i').style.width=(p*100)+'%'; pe.classList.toggle('low',p>=.75); pe.classList.toggle('mid',p>=.5&&p<.75);
  const who=[NEEDS.fb&&`${NEEDS.fb} ${ago(NEEDS.ft)}餵過`, NEEDS.wb&&`${NEEDS.wb} ${ago(NEEDS.wt)}給水`, NEEDS.pb&&`${NEEDS.pb} ${ago(NEEDS.pt)}帶去尿尿`].filter(Boolean).join('・');
  box.querySelector('#needWho').textContent= who || (f<.25||w<.25||p>=.75? '阿布在等人照顧…' : '');
}

/* ================= 主畫面 ================= */
/* 等級＝陪阿布長大：越後面越難（第 n 級要 40×n 點），Lv.1 是 2 個月大的幼犬，Lv.15 長到現在的阿布 */
const AGE_LV=15;
const lvOf=L=>{ let n=1; while(20*(n+1)*n<=L) n++; return n; };
function birthDate(){
  const n=(CONFIG.birthday||'').match(/\d+/g);
  return n&&n.length>=3&&n[0].length===4? new Date(+n[0],n[1]-1,+n[2]) : new Date(2019,5,15);
}
const monthsOld=t=>(t-birthDate())/(30.44*864e5);
function ageMonthsAt(lv){ const cur=Math.floor(monthsOld(Date.now())); return lv>=AGE_LV? cur : Math.round(2+(lv-1)*(cur-2)/(AGE_LV-1)); }
function ageLabel(m){ if(m<12) return `${m} 個月大`; const y=Math.floor(m/12); return m%12>=6? `${y} 歲半` : `${y} 歲`; }
function levelInfo(){
  const lv=lvOf(S.love), base=20*lv*(lv-1), per=40*lv, m=ageMonthsAt(lv);
  return {lv, m, title: lv>=AGE_LV? `現在的阿布（${ageLabel(m)}）` : `${ageLabel(m)}的阿布`, pct:(S.love-base)/per*100, left:base+per-S.love};
}
/* 小相框：輪播「這個年紀」的阿布照片（拍攝日期前後 4 個月；沒有就挑最接近的） */
function agePhotos(m){
  const all=pool().filter(p=>!isVid(p)&&!p.sample&&p.taken);
  if(!all.length) return [];
  const d=p=>Math.abs(monthsOld(p.taken)-m), near=all.filter(p=>d(p)<=4);
  return near.length? near : all.slice().sort((a,b)=>d(a)-d(b)).slice(0,6);
}
let ageT=0, ageIdx=0;
function renderAgePic(){
  const el=$('#agePic'); if(!el) return;
  const L=levelInfo(), list=agePhotos(L.m); clearInterval(ageT);
  const show=()=>{ if(!document.body.contains(el)) return clearInterval(ageT);
    const p=list[ageIdx++%list.length]; el.innerHTML=pimg(p,240,'alt=""'); el.dataset.id=p.id; };
  if(!list.length){ el.innerHTML=`<img src="${face(FACES.normal)}" alt="">`; delete el.dataset.id; return; }
  ageIdx=Math.floor(Math.random()*list.length); show(); if(list.length>1) ageT=setInterval(show,6000);
  el.onclick=()=>{ const p=pool().find(x=>x.id===el.dataset.id); if(!p) return; sfx.pop();
    const a=ageLabel(Math.max(0,Math.round(monthsOld(p.taken))));
    modal(`<h3>${a}的阿布</h3>${pimg(p,1200,'class="big-photo" alt=""')}<p>${p.cap?esc(p.cap)+'<br>':''}<small>${fmtDate(p.taken)}</small></p><button class="btn" data-close>好可愛</button>`); };
}
let lastAgeLv=0;
function renderLove(){
  const L=levelInfo(), el=$('#love'); if(!el) return;
  if(L.lv!==lastAgeLv||!$('#agePic').firstChild){ lastAgeLv=L.lv; renderAgePic(); }
  el.querySelector('.lv').textContent='Lv.'+L.lv;
  el.querySelector('.title').textContent=L.title;
  el.querySelector('.num').textContent='再 '+L.left+' 點升級';
  el.querySelector('.bar i').style.width=L.pct+'%';
}
/* 越摸越開心：連續摸，阿布的表情一階一階變開心；停手後慢慢回落 */
const LADDER = [
  { at:1,  faces:['face_65'],             lines:['嘿嘿～','摸摸頭～','（尾巴搖一下）'],     hearts:1, label:'有點開心' },
  { at:4,  faces:['face_143','face_142'], lines:['再摸一下！','耳朵後面也要','還要還要'], hearts:2, label:'開心' },
  { at:8,  faces:['face_60'],             lines:['好舒服～','尾巴停不下來了','嘿嘿嘿'],   hearts:3, label:'很開心' },
  { at:13, faces:['face_68'],             lines:['最喜歡你了！','汪！汪！','今天最棒了','阿布最高！！'], hearts:4, label:'超開心' },
  { at:19, faces:['face_66'],             lines:['汪汪汪！！','開心到飛起來！','全世界最幸福的狗！','阿布最高！！'], hearts:6, label:'開心到爆炸' },
];
const MELT_AT = 32;
function tierOf(c){ let t=-1; LADDER.forEach((l,i)=>{ if(c>=l.at) t=i; }); return t; }
const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
function isBirthday(){
  const n=(CONFIG.birthday||'').match(/\d+/g); if(!n||n.length<2) return false;
  const [mm,dd]= n.length>=3? [n[1],n[2]] : [n[0],n[1]];
  const d=new Date(); return +mm===d.getMonth()+1 && +dd===d.getDate();
}

/* 進到首頁時的第一句話：好久不見 > 每日餅乾 > 生日 > 時段問候 */
function greeting(){
  const now=Date.now(), today=todayKey(), name=S.me? S.me: '';
  const gap = S.lastSeen? (now-S.lastSeen)/864e5 : 0;
  const first = S.lastDay!==today;
  let line, gift=0, mood='normal', missed=false;
  const hr=new Date().getHours();
  if(first){ gift=2; }
  if(S.lastSeen && gap>=3){ missed=true; gift=Math.min(8, 2+Math.floor(gap)); line=`${name?name+'！':''}好久不見，阿布好想你！`; mood='miss'; }
  else if(hr>=22||hr<6){ line='呼…呼…'; mood='night'; }
  else if(hr<10) line= name? `${name}早安！今天要去散步嗎？` : '早安！今天要去散步嗎？';
  else if(hr<14) line='午餐吃什麼？有我的份嗎？';
  else if(hr<17) line= name? `${name}，下午好～` : '下午好～陪我玩一下';
  else line= name? `${name}你回來了！` : '晚上好～今天過得好嗎？';
  try{ const B=bathInfo(); if(B.last&&B.days===0&&mood==='normal') line='我今天洗香香了，聞聞看！'; }catch(e){}
  if(mood==='normal'&&(fullNow()<.25||waterNow()<.25||peeNow()>=.75)) line= peeNow()>=.75? '我想出門尿尿…（在門口轉圈）' : fullNow()<.25? '肚子好餓…可以給我餅乾嗎？' : '好渴喔…可以給我水嗎？';
  if(isBirthday()){ line='今天是我的生日！汪！'; mood='bday'; }
  S.lastSeen=now; S.lastDay=today; save();
  return {line,gift,mood,missed,first};
}

function Home(){
  const s=h(`<section class="screen">
    <div id="lostBox"></div>
    <div class="love" id="love"><div class="agepic" id="agePic"></div><span class="lv">Lv.1</span><span class="title"></span><span class="num"></span><div class="bar"><i></i></div></div>
    <div class="needs" id="needs"><div class="need" id="needF"><span>🍖 飽足</span><div class="nbar"><i></i></div></div><div class="need" id="needW"><span>💧 水分</span><div class="nbar"><i></i></div></div><div class="need" id="needP"><span>🌳 尿尿</span><div class="nbar"><i></i></div></div><small id="needWho"></small></div>
    <div class="stage">
      <div class="bubble" id="bubble">汪！</div>
      <div class="abu" id="abu" role="button" tabindex="0" aria-label="摸摸阿布"><img id="abuImg" alt="阿布"></div>
      <div class="fx" id="fx"></div>
    </div>
    <div class="joy" id="joy" aria-live="polite"><span class="joy-dots">${LADDER.map(()=>'<i></i>').join('')}</span><span class="joy-label" id="joyLabel">點阿布的臉摸摸他，越摸越開心</span></div>
    <div class="actions">
      <button class="act" id="aPet"><svg><use href="#i-hand"/></svg>摸摸<small>按住是抓抓</small></button>
      <button class="act" id="aFeed"><img class="ico" src="img/biscuit/bear.png" alt="">餵餅乾<small>用 1 片 · 止餓</small></button>
      <button class="act" id="aDrink"><span class="ico-emoji">💧</span>喝水<small>免費</small></button>
      <button class="act" id="aWalk"><svg><use href="#i-leash"/></svg>去散步<small>尿尿 · +2 好感</small></button>
    </div>
  </section>`);
  main.appendChild(s); renderLove(); renderLost(); renderNeeds();
  const img=$('#abuImg'), abu=$('#abu'), bubble=$('#bubble'), fx=$('#fx'), joy=$('#joy');
  let state='normal', revert=null, idle=null, combo=0, tier=-1, decay=null, lastTap=0, bigParty=0;
  let holdT=null, blissT=null, bliss=false;
  const setFace=k=>{ if(img.dataset.k===k) return; img.dataset.k=k; img.src=face(k); };
  const say=(t,big)=>{ bubble.textContent=t; bubble.classList.remove('pop','big'); void bubble.offsetWidth; bubble.classList.add(big?'big':'pop'); setTimeout(()=>bubble.classList.remove('pop'),250); };
  const zzz=h('<div class="zzz" aria-hidden="true">Z z z</div>');
  const petHand=h('<div class="pet-hand" aria-hidden="true"><svg viewBox="0 0 64 84"><use href="#i-pethand"/></svg></div>');
  const earA=h('<div class="earpic" aria-hidden="true"></div>'), earB=h('<div class="earpic" aria-hidden="true"></div>');
  abu.appendChild(earA); abu.appendChild(earB); abu.appendChild(petHand);
  loadEars();
  let earI=Math.floor(Math.random()*9);
  /* 摸頭時換下一張飛機耳照片（兩層交叉淡入，不會閃） */
  function showEars(){
    if(!EARS.length){ hideEars(); setFace(FACES.happy[0]); return; }      // 飛機耳照片都還沒載好：先用開心的臉
    const e=EARS[earI++%EARS.length], lay=earA.classList.contains('on')? earB: earA, other=lay===earA? earB: earA;
    lay.style.backgroundImage=`url("${e.src}")`; lay.style.backgroundSize=e.size; lay.style.backgroundPosition=e.pos;
    lay.classList.add('on'); other.classList.remove('on');
  }
  const hideEars=()=>{ earA.classList.remove('on'); earB.classList.remove('on'); };
  let rubDist=0, lastX=null, lastY=null;
  const hat=h(`<svg class="hat" aria-hidden="true"><use href="#i-hat"/></svg>`);
  const resetIdle=()=>{ clearTimeout(idle); idle=setTimeout(sleep,20000); };
  const baseFace=()=> tier>=0? LADDER[tier].faces[0] : FACES.normal;

  function renderJoy(){
    joy.querySelectorAll('.joy-dots i').forEach((d,i)=>d.classList.toggle('on',i<=tier));
    joy.classList.toggle('max',tier===LADDER.length-1);
    abu.dataset.tier=tier;
    $('#joyLabel').textContent = bliss? '飛機耳開啟中…' : tier<0? '點阿布的臉摸摸他，越摸越開心' : `開心度：${LADDER[tier].label}`;
  }
  function sleep(){ if(bliss) return; state='sleep'; combo=0; tier=-1; renderJoy(); setFace(FACES.sleep); say('呼…呼…'); abu.appendChild(zzz); }
  function wake(){
    if(state!=='sleep') return false;
    state='normal'; zzz.remove(); setFace(pick(FACES.look));
    const hr=new Date().getHours();
    say(hr>=22||hr<6? '嗯…你還沒睡喔？' : pick(LINES.wake)); tone(500,.12,'sine',.1,300); return true;
  }
  function mood(k,ms=1400){ clearTimeout(revert); setFace(k); revert=setTimeout(()=>{ if(state!=='sleep'&&!bliss) setFace(baseFace()); },ms); }
  function hearts(n=3,x,y,spread=60){
    const r=fx.getBoundingClientRect();
    for(let i=0;i<n;i++){
      const e=h(`<svg class="heart"><use href="#i-heart"/></svg>`);
      const a=Math.random()*Math.PI*2;
      e.style.left=((x??r.width/2)+Math.cos(a)*Math.random()*spread)+'px';
      e.style.top=((y??r.height/2)+Math.sin(a)*Math.random()*spread*.6)+'px';
      e.style.setProperty('--dx',(Math.random()*100-50)+'px'); e.style.setProperty('--r',(Math.random()*40-20)+'deg');
      e.style.animationDelay=(i*.06)+'s';
      fx.appendChild(e); setTimeout(()=>e.remove(),1600);
    }
  }
  /* 停手後：2.5 秒開始，每 1.3 秒往下掉一階，臉也跟著慢慢變回來 */
  function scheduleDecay(){
    clearTimeout(decay);
    decay=setTimeout(function step(){
      if(bliss) return;
      if(tier<=0){ combo=0; tier=-1; renderJoy(); if(state!=='sleep'){ setFace(FACES.normal); say(pick(['（滿足地坐好）','剛剛好開心','還要再摸喔'])); } return; }
      tier--; combo=LADDER[tier].at; renderJoy(); setFace(LADDER[tier].faces[0]);
      decay=setTimeout(step,1300);
    },2500);
  }
  function pet(e){
    ac(); resetIdle();
    if(wake()) return;
    const now=Date.now(); if(now-lastTap>6000 && tier<0) combo=0; lastTap=now;
    combo++;
    abu.classList.remove('wiggle'); void abu.offsetWidth; abu.classList.add('wiggle');
    const r=fx.getBoundingClientRect(), x=e&&e.clientX? e.clientX-r.left: undefined, y=e&&e.clientY? e.clientY-r.top: undefined;
    if(combo>=MELT_AT){                                  // 摸到融化：瞇眼攤平，然後慢慢回來
      combo=LADDER[LADDER.length-1].at; clearTimeout(revert);
      setFace('face_62'); say('被摸到融化了…',true); hearts(10); tone(392,.5,'sine',.1,-120);
      petLove(3); scheduleDecay(); return;
    }
    const nt=tierOf(combo), up=nt>tier; tier=nt; renderJoy();
    const L=LADDER[tier];
    if(up){                                              // 升一階：換更開心的臉、更多愛心、叫聲更高
      clearTimeout(revert); setFace(pick(L.faces)); say(pick(L.lines),true);
      hearts(L.hearts+2,x,y,80); bark(Math.min(3,1+Math.floor(tier/2)));
      tone(520+tier*120,.12,'triangle',.1,200);
      if(tier===LADDER.length-1 && now-bigParty>60000){ bigParty=now; party(); }
    }else{
      mood(pick(L.faces),1600); say(pick(L.lines));
      hearts(L.hearts,x,y);
      if(Math.random()<.35) bark(1); else tone(600+tier*80,.07,'triangle',.1,250);
    }
    petLove(tier>=3?2:1);
    scheduleDecay();
  }
  function party(){
    abu.classList.add('party'); setTimeout(()=>abu.classList.remove('party'),1600);
    hearts(16,undefined,undefined,140); sfx.win();
    petLove(5); toast(needy()? '阿布開心到爆炸！（肚子餓，好感只加一半）' : '阿布開心到爆炸！好感 +5');
  }
  /* 按住 = 摸頭：阿布被摸頭會開飛機耳 */
  function holdStart(){
    clearTimeout(holdT);
    holdT=setTimeout(()=>{
      if(state==='sleep') return;
      bliss=true; clearTimeout(decay); clearTimeout(revert); showEars(); say('（飛機耳開啟）好舒服…'); renderJoy();
      abu.classList.add('bliss'); petHand.classList.add('on'); let n=0;
      const blissLines=['（飛機耳開啟）好舒服…','再往左邊一點','耳朵後面也要','（頭一直往你手上靠）','不要停～','（整隻融化了）'];
      blissT=setInterval(()=>{ hearts(1); if(++n%3===0) petLove(1); if(n%5===0) tone(330,.25,'sine',.06,-40); if(n%6===0){ say(blissLines[(n/6)%blissLines.length|0]); if(EARS.length>1) showEars(); } },450);
    },650);
  }
  function holdEnd(){
    clearTimeout(holdT);
    if(!bliss) return;
    bliss=false; clearInterval(blissT); abu.classList.remove('bliss'); petHand.classList.remove('on'); petHand.style.left=''; lastX=null;
    tier=Math.max(tier,2); combo=Math.max(combo,LADDER[2].at); renderJoy();
    setFace(pick(LADDER[tier].faces)); hideEars(); say(pick(['再抓一下嘛','好舒服喔','那邊那邊！'])); scheduleDecay();
  }
  abu.addEventListener('pointerdown',e=>{ try{ abu.setPointerCapture(e.pointerId); }catch(x){} pet(e); holdStart(); });
  /* 按住時手指移動：手跟著手指在頭上摸來摸去，摸越多越開心 */
  abu.addEventListener('pointermove',e=>{
    if(!bliss) return;
    const r=abu.getBoundingClientRect();
    const px=Math.max(22,Math.min(78,(e.clientX-r.left)/r.width*100));
    petHand.style.left=px+'%';
    if(lastX!==null){ rubDist+=Math.hypot(e.clientX-lastX,e.clientY-lastY); }
    lastX=e.clientX; lastY=e.clientY;
    if(rubDist>90){ rubDist=0; hearts(1,e.clientX-fx.getBoundingClientRect().left,r.top-fx.getBoundingClientRect().top+r.height*.2,20); petLove(1); tone(360+Math.random()*60,.12,'sine',.05,-30); }
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>abu.addEventListener(ev,holdEnd));
  abu.addEventListener('contextmenu',e=>e.preventDefault());
  abu.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pet(); } });
  $('#aPet').onclick=()=>pet();

  /* 餵餅乾：只止餓、不加好感（全家共用的飽足度）；吃飽了就不扣餅乾 */
  $('#aFeed').onclick=()=>{
    ac(); resetIdle(); wake();
    if(fullNow()>=.95){ mood('face_62',1800); say(pick(['吃飽了，肚子圓圓的～','等一下再吃好不好','（打嗝）'])); tone(260,.3,'sine',.08,-60); return; }
    if(S.bones<1){ say(pick(LINES.noBone)); mood(pick(FACES.look)); sfx.bad(); return; }
    addBones(-1);
    const fl=FLAVORS[Math.floor(Math.random()*3)], wasHungry=hungry();
    clearTimeout(revert); setFace('face_143'); say('餅乾！？');           // 聽到餅乾，耳朵立起來
    const b=h(`<img class="flying-bone" src="${pick(SHAPES)}" alt="">`); fx.appendChild(b); setTimeout(()=>b.remove(),650);
    setTimeout(()=>{
      careAbu('eat');
      abu.classList.remove('chomp'); void abu.offsetWidth; abu.classList.add('chomp');
      mood('face_66',1800); say(fullNow()>=.95? '吃飽了！謝謝！' : wasHungry? '終於有吃的了！咔滋咔滋' : pick([`${fl.n}口味的！咔滋咔滋`,`最喜歡${fl.n}的了！`,...LINES.eat])); sfx.crunch(); hearts(3);
    },450);
  };
  /* 喝水：免費，直接補滿 */
  $('#aDrink').onclick=()=>{
    ac(); resetIdle(); wake();
    if(waterNow()>=.95){ mood(pick(FACES.look),1400); say(pick(['喝飽了～','還不渴喔','（舔舔嘴巴走開）'])); return; }
    const d=h(`<div class="flying-bone drop">💧</div>`); fx.appendChild(d); setTimeout(()=>d.remove(),650);
    setTimeout(()=>{ careAbu('drink'); mood('face_60',1600); say(waterNow()>=.95? '喝飽了！' : pick(['咕嚕咕嚕～','好好喝！','水好冰涼','還要還要','（舔水舔得到處都是）'])); for(let k=0;k<4;k++) tone(300+k*40,.08,'sine',.08,120,k*.12); },450);
  };
  /* 去散步：阿布一定在外面上廁所；剛上過就不肯出門 */
  $('#aWalk').onclick=()=>{
    ac(); resetIdle(); wake();
    if(peeNow()<.3){ mood(pick(FACES.look),1800); say(pick(['剛剛才去過，不想出門','（趴著不動）','外面好熱，等一下再去'])); tone(240,.25,'sine',.08,-40); return; }
    bark(2);
    const p=pick(walkPhotos()), urgent=mustPee();
    careAbu('walk'); addLove(2);
    modal(`<h3>${urgent?'終於尿出來了～':'出門散步囉！'}</h3>${pimg(p,1200,`class="big-photo" alt="${esc(p.cap||'阿布')}"`)}${p.cap?`<p>${esc(p.cap)}</p>`:''}<button class="btn" data-close>回家</button>`,()=>{
      tier=Math.max(tier,2); combo=Math.max(combo,LADDER[2].at); renderJoy();
      setFace(pick(LADDER[tier].faces)); say('散步好開心！',true); hearts(5); scheduleDecay();
    });
  };

  /* 進場 */
  const g=greeting();
  renderJoy();
  if(g.mood==='night'){ state='sleep'; setFace(FACES.sleep); abu.appendChild(zzz); say(g.line); }
  else if(g.mood==='miss'){ setFace('face_143'); say(g.line,true); setTimeout(()=>{ setFace('face_60'); hearts(8); bark(2); tier=2; combo=LADDER[2].at; renderJoy(); scheduleDecay(); },1400); }
  else { setFace(FACES.normal); say(g.line); }
  if(g.mood==='bday'){
    abu.appendChild(hat);
    const y=new Date().getFullYear();
    if(S.bdayGift!==y){ S.bdayGift=y; save(); setTimeout(()=>{ addBones(5); hearts(12,undefined,undefined,140); sfx.win(); toast('今天是阿布生日！阿布分你 5 片餅乾'); },900); }
  }
  if(g.gift){
    setTimeout(()=>{ addBones(g.gift); toast(g.missed? `阿布把藏起來的 ${g.gift} 片餅乾都給你了` : `阿布叼來今天的 ${g.gift} 片餅乾`,2400); },g.mood==='miss'?2200:700);
  }
  resetIdle();
  const chatter=setInterval(()=>{ if(state!=='sleep'&&!bliss&&tier<0&&Date.now()-lastTap>8000) say(mustPee()&&Math.random()<.6? pick(['想出門…','（叼著牽繩過來）','（在門口轉圈圈）','（扒門）']) : hungry()&&Math.random()<.6? pick(['肚子好餓…','有沒有餅乾？','（盯著餅乾罐）']) : thirsty()&&Math.random()<.6? pick(['好渴喔…','想喝水','（舔舔嘴巴）']) : Math.random()<.25&&bathInfo().state==='due'? '我好像有點狗味了…該洗澡了嗎？' : pick(LINES.idle)); },9000);
  const needT=setInterval(renderNeeds,30000);
  cleanup=()=>{ clearTimeout(idle); clearTimeout(revert); clearTimeout(decay); clearTimeout(holdT); clearInterval(blissT); clearInterval(chatter); clearInterval(needT); };
}

/* ================= 小遊戲清單 ================= */
function Games(){
  const s=h(`<section class="screen">
    <div class="album-head"><div><h2>小遊戲</h2><p class="sub">贏了拿餅乾，餅乾可以餵阿布、解鎖回憶照片和阿布短片。</p></div><button class="btn sm" id="boardBtn">🏆 排行榜</button></div>
    <button class="game-card" data-g="memory"><img class="thumb" src="img/face_60.jpg" alt=""><div><b>回憶翻牌</b><span>翻開兩張一樣的照片</span></div><span class="reward">+3~8<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="catch"><img class="thumb" src="${face('face_68')}" alt=""><div><b>阿布接零食</b><span>左右滑動接住食物，巧克力、葡萄、洋蔥不能吃</span></div><span class="reward">+1~10<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="puzzle"><img class="thumb" src="img/face_142.jpg" alt=""><div><b>照片拼圖</b><span>點兩塊交換位置，拼回原來的照片</span></div><span class="reward">+5<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="bowl"><img class="thumb" src="img/face_66.jpg" alt=""><div><b>幫阿布裝飯</b><span>按住倒飼料，倒到剛剛好的份量</span></div><span class="reward">+3~12<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="quiz"><img class="thumb" src="img/face_143.jpg" alt=""><div><b>阿布能不能吃？</b><span>葡萄可以嗎？地瓜呢？考考你</span></div><span class="reward">+1~6<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="car"><img class="thumb" src="img/face_66.jpg" alt=""><div><b>阿布去兜風</b><span>阿布最愛坐車，到目的地後不肯下車</span></div><span class="reward">+1~12<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="walk"><img class="thumb" src="img/face_65.jpg" alt=""><div><b>陪阿布散步</b><span>阿布怕人多、怕鞭炮，越緊張越想衝回家</span></div><span class="reward">+1~12<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="stairs"><img class="thumb" src="img/face_stairs.jpg" alt=""><div><b>阿布下樓梯</b><span>一階一階往下跳，別被天花板刺到</span></div><span class="reward">+1~12<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
  </section>`);
  s.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ sfx.pop(); ac(); backTo='games'; go(b.dataset.g); });
  main.appendChild(s);
  $('#boardBtn').onclick=()=>{ sfx.pop(); showBoards(); };
  renderRecords(); loadBoards();
}
function gameBar(title,statId){
  const bar=h(`<div class="gamebar"><button class="back" aria-label="返回"><svg><use href="#i-back"/></svg></button><h2>${title}</h2><span class="stat" id="${statId}"></span></div>`);
  bar.querySelector('.back').onclick=()=>go(backTo);
  return bar;
}
function winDialog({title,text,bones,faceKey='face_60',again,rank}){
  sfx.win(); setTimeout(()=>bark(2),500); addBones(bones);
  const m=modal(`<img class="face-img" src="${face(faceKey)}" alt=""><h3>${title}</h3><p>${text}</p><div class="gain">+${bones}<img class="ico" src="img/biscuit/bear.png" alt=""></div><div class="rankline" id="rankLine"></div><div class="row"><button class="btn" id="again">再玩一次</button><button class="btn ghost" data-close>${backTo==='food'?'回日常':'回小遊戲'}</button></div>`,()=>go(backTo));
  m.el.querySelector('#again').onclick=()=>{ m.el.remove(); again(); };
  if(rank) postScore(rank.game,rank.score,m.el.querySelector('#rankLine'));
}

/* ================= 全家排行榜：各玩各的，成績上傳比高低 ================= */
const GAME_INFO={memory:{n:'回憶翻牌',u:'次',low:1},catch:{n:'阿布接零食',u:'分'},puzzle:{n:'照片拼圖',u:'次',low:1},bowl:{n:'幫阿布裝飯',u:'片'},quiz:{n:'阿布能不能吃',u:'題'},car:{n:'阿布去兜風',u:'秒'},walk:{n:'陪阿布散步',u:'公尺'},stairs:{n:'阿布下樓梯',u:'樓'}};
let BOARDS=lsGet('abu-boards')||{};
const fmtScore=(g,v)=>`${v} ${GAME_INFO[g].u}`;
async function loadBoards(){
  if(!API_URL) return;
  try{ const r=await fetch(API_URL+'?action=board'); const j=await r.json(); if(j.ok&&j.boards){ BOARDS=j.boards; lsSet('abu-boards',BOARDS); if(current==='games') renderRecords(); } }catch(e){}
}
function renderRecords(){                                        // 遊戲卡片上顯示全家紀錄保持人
  document.querySelectorAll('.game-card[data-g]').forEach(b=>{
    const g=b.dataset.g, top=BOARDS[g]&&BOARDS[g].all&&BOARDS[g].all[0]; let el=b.querySelector('.rec');
    if(!top){ if(el) el.remove(); return; }
    if(!el){ el=h('<small class="rec"></small>'); b.querySelector('div').appendChild(el); }
    el.textContent=`🏆 ${top.by} ${fmtScore(g,top.s)}`;
  });
}
async function postScore(g,v,box){
  if(!box) return;
  if(!API_URL){ box.hidden=true; return; }
  if(!S.me){                                                     // 還不知道你是誰：留名字就上榜
    box.innerHTML=`<p class="meta">留下名字，上全家排行榜</p><div class="rankname"><input maxlength="30" placeholder="例：媽媽"><button class="btn sm">上榜</button></div>`;
    const i=box.querySelector('input'); box.querySelector('button').onclick=()=>{ const n=i.value.trim(); if(!n){ i.focus(); return; } S.me=n; save(); postScore(g,v,box); };
    return;
  }
  box.innerHTML='<p class="meta">上傳成績中…</p>';
  try{
    const j=await api({action:'score',game:g,score:v,by:S.me});
    BOARDS[g]=j.board; lsSet('abu-boards',BOARDS);
    const top= j.beat? `<b class="beat">打破了 ${esc(j.beat.by)} 的全家紀錄（${fmtScore(g,j.beat.s)}）！</b>` : j.rank===1? '<b class="beat">全家第 1 名！</b>' : `全家第 ${j.rank} 名${j.record?'，你的新紀錄！':''}`;
    box.innerHTML=`<p>${top}${j.wrank?`<br><span class="meta">本週第 ${j.wrank} 名</span>`:''}</p><button class="linkbtn" id="seeBoard">看排行榜</button>`;
    box.querySelector('#seeBoard').onclick=()=>showBoards(g);
    if(j.beat||j.rank===1) setTimeout(()=>{ sfx.win(); bark(3); },600);
  }catch(e){ box.innerHTML='<p class="meta">成績沒上傳成功，下次再試</p>'; }
}
function showBoards(g0){
  let g=g0||'car', wk=false;
  const m=modal(`<h3>全家排行榜</h3>
    <div class="bpills">${Object.keys(GAME_INFO).map(k=>`<button data-g="${k}">${GAME_INFO[k].n}</button>`).join('')}</div>
    <div class="seg" id="bSeg"><button data-w="0">總榜</button><button data-w="1">本週</button></div>
    <ol class="blist" id="bList"></ol><button class="btn ghost" data-close>關閉</button>`);
  const draw=()=>{
    m.el.querySelectorAll('.bpills button').forEach(b=>b.setAttribute('aria-checked',b.dataset.g===g));
    m.el.querySelectorAll('#bSeg button').forEach(b=>b.setAttribute('aria-checked',(b.dataset.w==='1')===wk));
    const list=((BOARDS[g]||{})[wk?'week':'all'])||[];
    m.el.querySelector('#bList').innerHTML= list.length? list.map((x,i)=>`<li class="${x.by===S.me?'me':''}"><span class="medal">${['🥇','🥈','🥉'][i]||(i+1)}</span><span class="bn">${esc(x.by)}</span><b>${fmtScore(g,x.s)}</b></li>`).join('') : `<li class="empty">還沒有人玩${wk?'（本週）':''}，快去搶第一！</li>`;
    const pb=m.el.querySelector(`.bpills button[data-g="${g}"]`); if(pb) pb.scrollIntoView({inline:'center',block:'nearest'});
  };
  m.el.querySelectorAll('.bpills button').forEach(b=>b.onclick=()=>{ g=b.dataset.g; draw(); });
  m.el.querySelectorAll('#bSeg button').forEach(b=>b.onclick=()=>{ wk=b.dataset.w==='1'; draw(); });
  draw(); loadBoards().then(draw);
}

/* ================= 翻牌 ================= */
function Memory(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('回憶翻牌','mstat'));
  const grid=h(`<div class="cards"></div>`); s.appendChild(grid);
  s.appendChild(h(`<p class="hint">解鎖越多照片，牌組就越多變化</p>`));
  main.appendChild(s);
  const faces=['face_60','face_65','face_66','face_62','face_143','face_142','face_68'].map(k=>({key:k,html:`<img src="${face(k)}" alt="">`}));
  const photos=openPhotos().map(p=>({key:p.id,html:pimg(p,400,'alt=""')}));
  const chosen=[...faces,...photos].sort(()=>Math.random()-.5).slice(0,6);
  const deck=[...chosen,...chosen].map(c=>({...c})).sort(()=>Math.random()-.5);
  let open=[], moves=0, found=0, lock=false;
  const stat=$('#mstat'); const upd=()=>stat.textContent=`翻了 ${moves} 次`; upd();
  deck.forEach(c=>{
    const el=h(`<button class="card" aria-label="翻牌"><div class="backside"><span><svg><use href="#i-paw"/></svg></span></div><div class="face">${c.html}</div></button>`);
    c.el=el; grid.appendChild(el);
    el.onclick=()=>{
      if(lock||el.classList.contains('open')||el.classList.contains('done')) return;
      sfx.flip(); el.classList.add('open'); open.push(c);
      if(open.length===2){
        moves++; upd(); lock=true;
        const [a,b]=open;
        if(a.key===b.key){
          setTimeout(()=>{ a.el.classList.add('done'); b.el.classList.add('done'); sfx.good(); open=[]; lock=false; found++;
            if(found===6){ const bones=Math.max(3,Math.min(8,14-moves)); setTimeout(()=>winDialog({title:'全部配對成功！',text:`只翻了 ${moves} 次，阿布說你記性真好。`,bones,again:()=>go('memory'),rank:{game:'memory',score:moves}}),500); }
          },350);
        }else{
          setTimeout(()=>{ a.el.classList.remove('open'); b.el.classList.remove('open'); open=[]; lock=false; },800);
        }
      }
    };
  });
}

/* ================= 接零食 ================= */
function Catch(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('阿布接零食','cstat'));
  const wrap=h(`<div class="catch-wrap"><canvas></canvas></div>`); s.appendChild(wrap);
  s.appendChild(h(`<div class="legend"><span><b>可以吃</b> <img class="ico" src="img/biscuit/bear.png" alt=""> +3（阿布最愛）　🍗 +2　🥕 🍎 +1</span><span class="no"><b class="no">不能吃</b> 🍫 🍇 🧅</span></div>`));
  main.appendChild(s);
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d');
  const avatar=new Image(); avatar.src=face('face_68'); const avatarHappy=new Image(); avatarHappy.src=face('face_66'); const avatarSad=new Image(); avatarSad.src=face('face_143');
  const GOOD=[['bis',3],['bis',3],['🍗',2],['🥕',1],['🍎',1]], BAD=[['🍫','巧克力對狗狗有毒！'],['🍇','葡萄會傷狗狗的腎臟！'],['🧅','洋蔥狗狗不能吃！']];
  const bisImg=SHAPES.map(u=>{ const im=new Image(); im.src=u; return im; });
  let W=0,H=0,dpr=1, px=0, tx=0, items=[], score=0, lives=3, t0=0, last=0, spawnT=0, running=false, raf=0, flash=0, faceMode='n', faceT=0;
  const DUR=40;
  function size(){ const r=wrap.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); if(!px) px=tx=W/2; }
  size(); const ro=new ResizeObserver(size); ro.observe(wrap);
  const R=()=>Math.max(30,Math.min(44,W*.1));
  function setX(e){ const r=wrap.getBoundingClientRect(); tx=Math.max(R(),Math.min(W-R(),e.clientX-r.left)); }
  wrap.addEventListener('pointerdown',e=>{ setX(e); wrap.setPointerCapture&&wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener('pointermove',e=>{ if(e.pointerType==='mouse'||e.buttons||e.pressure) setX(e); });
  const stat=$('#cstat'); const upd=()=>{ stat.textContent=`${score} 分　${'♥'.repeat(lives)}${'♡'.repeat(3-lives)}`; };
  function spawn(el){
    const bad=Math.random()<Math.min(.38,.2+el/150);
    const it=bad? pick(BAD): pick(GOOD);
    items.push({x:20+Math.random()*(W-40), y:-30, v:(120+el*6+Math.random()*60), bad, e:it[0], val:bad?0:it[1], tip:bad?it[1]:'', rot:Math.random()*6.28, vr:(Math.random()-.5)*3, fl:Math.floor(Math.random()*SHAPES.length)});
  }
  function drawAvatar(){
    const r=R(), y=H-r-14;
    const im= faceMode==='h'?avatarHappy: faceMode==='s'?avatarSad: avatar;
    ctx.save(); ctx.beginPath(); ctx.arc(px,y,r+5,0,7); ctx.fillStyle= faceMode==='s'?'#C8452F':'#F2C230'; ctx.fill();
    ctx.beginPath(); ctx.arc(px,y,r,0,7); ctx.clip(); if(im.complete) ctx.drawImage(im,px-r,y-r,r*2,r*2); ctx.restore();
    return y;
  }
  function frame(ts){
    if(!running) return;
    const dt=Math.min(.05,(ts-last)/1000||0); last=ts;
    const el=(ts-t0)/1000, left=Math.max(0,DUR-el);
    px+= (tx-px)*Math.min(1,dt*14);
    spawnT-=dt; if(spawnT<=0){ spawn(el); spawnT=Math.max(.32,.8-el*.012); }
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(43,39,35,.12)'; ctx.fillRect(12,12,W-24,8);
    ctx.fillStyle='#D9772B'; ctx.fillRect(12,12,(W-24)*left/DUR,8);
    const r=R(); const ay=drawAvatar();
    if(faceT>0){ faceT-=dt; if(faceT<=0) faceMode='n'; }
    ctx.font='34px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let i=items.length-1;i>=0;i--){
      const it=items[i]; it.y+=it.v*dt; it.rot+=it.vr*dt;
      ctx.save(); ctx.translate(it.x,it.y); ctx.rotate(it.rot*.15); if(it.e==='bis'){ const bi=bisImg[it.fl]; if(bi.complete&&bi.naturalWidth){ const s=42/Math.max(bi.naturalWidth,bi.naturalHeight); ctx.drawImage(bi,-bi.naturalWidth*s/2,-bi.naturalHeight*s/2,bi.naturalWidth*s,bi.naturalHeight*s); } } else ctx.fillText(it.e,0,0); ctx.restore();
      const d=Math.hypot(it.x-px,it.y-ay);
      if(d<r+14){
        items.splice(i,1);
        if(it.bad){ lives--; sfx.bad(); faceMode='s'; faceT=.8; flash=.3; toast(it.tip,1500); if(navigator.vibrate) try{navigator.vibrate(80)}catch(e){} }
        else{ score+=it.val; sfx.good(); faceMode='h'; faceT=.45; }
        upd();
      } else if(it.y>H+40) items.splice(i,1);
    }
    if(flash>0){ flash-=dt; ctx.fillStyle=`rgba(200,69,47,${flash})`; ctx.fillRect(0,0,W,H); }
    if(lives<=0||left<=0){ end(); return; }
    raf=requestAnimationFrame(frame);
  }
  function start(){ items=[]; score=0; lives=3; faceMode='n'; upd(); running=true; last=performance.now(); t0=last; spawnT=.3; raf=requestAnimationFrame(frame); }
  function end(){
    running=false; cancelAnimationFrame(raf);
    const bones=Math.max(1,Math.min(10,Math.floor(score/6)));
    const best=Math.max(S.best.catch||0,score); const nb=best>(S.best.catch||0); S.best.catch=best; save();
    winDialog({title: lives<=0?'吃到不能吃的了！':'時間到！', text:`拿到 ${score} 分${nb?'，新紀錄！':`（最高 ${best} 分）`}`, bones, faceKey: lives<=0?'face_143':'face_66', again:()=>{ intro(); },rank:{game:'catch',score}});
  }
  function intro(){
    ctx.clearRect(0,0,W,H); drawAvatar();
    const m=modal(`<img class="face-img" src="${face('face_68')}" alt=""><h3>阿布肚子餓了</h3><p>手指在畫面上左右滑，讓阿布接住掉下來的食物。<br>吃到巧克力、葡萄、洋蔥會扣一顆愛心，40 秒內看你能拿幾分。</p><button class="btn" id="go">開始</button>`);
    m.el.querySelector('#go').onclick=()=>{ m.el.remove(); ac(); bark(1); start(); };
  }
  setTimeout(intro,50);
  cleanup=()=>{ running=false; cancelAnimationFrame(raf); ro.disconnect(); document.querySelectorAll('.overlay').forEach(o=>o.remove()); };
}

/* ================= 拼圖（用 CSS 背景裁切，雲端照片也能用） ================= */
function Puzzle(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('照片拼圖','pstat'));
  const ref=h(`<div class="ref"><img alt="完成圖"><span>完成的樣子。點一塊，再點另一塊，兩塊就會交換。</span></div>`); s.appendChild(ref);
  const board=h(`<div class="puzzle"></div>`); s.appendChild(board);
  main.appendChild(s);
  const p=pick(openPhotos()), url=purl(p,1000);
  let moves=0, sel=null; const stat=$('#pstat'); const upd=()=>stat.textContent=`交換 ${moves} 次`; upd();
  const im=new Image();
  im.onload=()=>start(url);
  im.onerror=()=>{ if(p.sample) return; const alt=`https://drive.google.com/thumbnail?id=${p.id}&sz=w1000`; im.onerror=()=>toast('照片載入失敗，換一張試試'); im.onload=()=>start(alt); im.src=alt; };
  im.src=url;
  function start(u){
    ref.querySelector('img').src=u;
    let order=[...Array(9).keys()];
    do{ order.sort(()=>Math.random()-.5); }while(order.filter((v,i)=>v===i).length>2);
    function draw(){
      board.innerHTML='';
      order.forEach((pos,i)=>{
        const t=h(`<button class="tile${pos===i?' ok':''}" aria-label="拼圖第 ${i+1} 格"></button>`);
        t.style.backgroundImage=`url("${u}")`;
        t.dataset.pos=pos; t.onclick=()=>tap(i,t); board.appendChild(t);
      });
      layout();
    }
    function layout(){
      const first=board.firstElementChild; if(!first) return;
      const T=first.getBoundingClientRect().width, gap=parseFloat(getComputedStyle(board).gap)||0;
      const span=T*3+gap*2, W=im.naturalWidth, H=im.naturalHeight, sc=span/Math.min(W,H);
      const bw=W*sc, bh=H*sc, ox=(bw-span)/2, oy=(bh-span)*.5;
      board.querySelectorAll('.tile').forEach(t=>{
        const pos=+t.dataset.pos, c=pos%3, r=Math.floor(pos/3);
        t.style.backgroundSize=`${bw}px ${bh}px`;
        t.style.backgroundPosition=`${-(ox+c*(T+gap))}px ${-(oy+r*(T+gap))}px`;
      });
    }
    function tap(i,t){
      if(board.classList.contains('solved')) return;
      if(sel===null){ sel=i; t.classList.add('sel'); sfx.flip(); return; }
      if(sel===i){ sel=null; t.classList.remove('sel'); return; }
      [order[sel],order[i]]=[order[i],order[sel]]; sel=null; moves++; upd(); draw(); sfx.pop();
      if(order.every((v,k)=>v===k)){
        board.classList.add('solved'); setTimeout(layout,450);
        setTimeout(()=>winDialog({title:'拼好了！',text:`${p.cap?`「${esc(p.cap)}」，`:''}交換了 ${moves} 次。`,bones:5,faceKey:'face_65',again:()=>go('puzzle'),rank:{game:'puzzle',score:moves}}),800);
      }
    }
    draw();
    const onR=()=>layout(); window.addEventListener('resize',onR);
    cleanup=()=>window.removeEventListener('resize',onR);
  }
}

/* ================= 相簿 ================= */
const albumList = () => [...pool()].filter(p=>!p.cat).sort((a,b)=>((b.taken?1:0)-(a.taken?1:0)) || ((b.taken||b.t||0)-(a.taken||a.t||0)));
function Album(){
  const list=albumList();
  const s=h(`<section class="screen">
    <div class="album-head"><div><h2 id="albumTitle">回憶相簿</h2><p class="sub">上傳照片／影片賺 +1 片餅乾</p></div>
      <button class="btn sm" id="upBtn"><svg><use href="#i-plus"/></svg>上傳</button></div>
    <div id="reelBox"></div>
    <p class="progress" id="prog"></p>
    <div class="album" id="grid"></div>
  </section>`);
  main.appendChild(s);
  $('#reelBox').replaceWith(reelStrip()); ensureTodayReel();
  $('#upBtn').onclick=()=>{ sfx.pop(); uploadDialog(); };
  const g=$('#grid');
  const ph=list.filter(p=>!isVid(p)), vs=list.filter(isVid), open=ph.filter(isOpen).length;
  $('#prog').textContent = PH_STATE==='loading'&&!PH.length? '從雲端硬碟讀照片中…'
    : passOn()? `共 ${ph.length} 張${vs.length?`、影片 ${vs.length} 支`:''}，已開通` : `已解鎖 ${open} / ${ph.length} 張${vs.length?`、影片 ${vs.filter(isOpen).length} / ${vs.length} 支`:''}${PH_STATE==='sample'?'（內建照片）':PH_STATE==='fail'?'（連不上雲端，先顯示內建照片）':''}`;
  const yearOf=p=>p.sample? '' : p.taken? String(new Date(p.taken).getFullYear()) : '?';
  const perYear={}; list.forEach(p=>{ const y=yearOf(p); perYear[y]=(perYear[y]||0)+1; });
  let year=null;
  list.forEach(p=>{
    const y=yearOf(p);
    if(y && y!==year){ year=y; g.appendChild(h(`<div class="month year">${y==='?'?'拍攝日期不明':y+' 年'}<span>${perYear[y]} 張</span></div>`)); }
    const un=isOpen(p), isNew=un&&!S.seen.includes(p.id)&&(isRecent(p)||S.unlocked.includes(p.id));
    const el=h(`<button class="photo${un?'':' locked'}" aria-label="${un?esc(p.cap||(isVid(p)?'阿布的影片':'阿布的照片')):(isVid(p)?'未解鎖影片':'未解鎖照片')}">${pimg(p,400,'alt="" loading="lazy"')}${un?((isNew?'<span class="new">NEW</span>':'')+(p.by?`<span class="who">${esc(p.by)}</span>`:'')):`<span class="lock"><svg><use href="#i-lock-d"/></svg>${PASS_COST} 片餅乾<small>看 ${PASS_MIN} 分鐘</small></span>`}${isVid(p)?vbadge(p):''}</button>`);
    el.onclick=()=>{ if(el._lp){ el._lp=false; return; } un? view(p): buyPass(p); };
    if(API_URL&&!p.sample) longPress(el,()=>photoMenu(p,()=>go('album',true)));
    g.appendChild(el);
  });
}
const ymd = t => { const d=new Date(t); return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`; };
function view(p){
  const back=current; let m;
  if(!S.seen.includes(p.id)){ S.seen.push(p.id); save(); }
  sfx.pop();
  const cap = p.cap? esc(p.cap) : (API_URL&&!p.sample&&CONFIG.ai? '<span class="meta">AI 正在寫這張的回憶，晚點再來看</span>' : '');
  const date = p.sample? '' : p.taken? `拍攝於 ${ymd(p.taken)}` : '拍攝日期不明';
  const media = isVid(p)? `<div class="vframe"><iframe src="https://drive.google.com/file/d/${encodeURIComponent(p.id)}/preview" allow="autoplay; fullscreen" allowfullscreen title="阿布的影片"></iframe></div>`
    : pimg(p,1600,`class="big-photo" alt="${esc(p.cap||'阿布')}"`);
  m=modal(`${media}
    ${cap?`<p class="vcap">${cap}</p>`:''}${date?`<span class="meta">${date}</span>`:''}
    <button class="btn" data-close>關閉</button>
    ${API_URL&&!p.sample?`<button class="linkbtn del" id="delPhoto">${isVid(p)?'刪除這支影片':'刪除這張照片'}</button>`:''}`,()=>go(back,true));
  if(isVid(p)) fitVideo(p,m.el.querySelector('.vframe'));
  const del=m.el.querySelector('#delPhoto');
  if(del) del.onclick=()=>{ m.el.remove(); deleteDialog(p,()=>go(back,true)); };
}
function deleteDialog(p,done){ photoMenu(p,done); const all=document.querySelectorAll('.overlay'); const b=all[all.length-1]&&all[all.length-1].querySelector('#delPhoto'); if(b) b.click(); }
function photoMenu(p,done){
  const cur=p.cat||'';
  const opts=[['','相簿'],['美食','美食'],['洗澡','洗澡'],['上廁所','上廁所']];
  const m=modal(`${pimg(p,400,'class="del-thumb" alt=""')}<h3>${isVid(p)?'這支影片':'這張照片'}</h3>
    <p class="meta">放錯地方了？點正確的位置</p>
    <div class="seg four" id="mvSeg">${opts.map(([c,l])=>`<button data-c="${c}" aria-checked="${c===cur}">${l}</button>`).join('')}</div>
    <button class="linkbtn del" id="delPhoto">刪除這張照片</button>
    <button class="btn ghost" data-close>取消</button>`,done);
  const el=m.el;
  el.querySelectorAll('#mvSeg button').forEach(b=>b.onclick=async()=>{
    const c=b.dataset.c; if(c===cur) return;
    el.querySelectorAll('#mvSeg button').forEach(x=>x.disabled=true); b.textContent='移動中…'; el.dataset.busy='1';
    try{ await api({action:'recat',id:p.id,cat:c||'回憶',by:S.me}); p.cat=c; p.how='手動'; if(c) S.unlocked.includes(p.id)||S.unlocked.push(p.id); lsSet('abu-photos',{photos:PH,config:CONFIG}); save(); toast(`已移到「${c||'相簿'}」`); }
    catch(err){ toast('移動失敗：'+err.message); }
    delete el.dataset.busy; m.close();
  });
  el.querySelector('#delPhoto').onclick=()=>{
    const box=el.querySelector('.dialog');
    box.innerHTML=`${pimg(p,400,'class="del-thumb" alt=""')}<h3>刪除這張照片？</h3><p>照片會移到雲端硬碟垃圾桶，30 天內可以救回。</p>
      <div class="row"><button class="btn danger" id="delYes">刪除</button><button class="btn ghost" id="delNo">取消</button></div>`;
    box.querySelector('#delNo').onclick=()=>m.close();
    const y=box.querySelector('#delYes');
    y.onclick=async()=>{
      y.disabled=true; y.textContent='刪除中…'; el.dataset.busy='1';
      try{ await api({action:'delete',id:p.id}); PH=PH.filter(x=>x.id!==p.id); lsSet('abu-photos',{photos:PH,config:CONFIG}); ensureFree(); toast('已刪除'); }
      catch(err){ toast('刪除失敗：'+err.message); }
      delete el.dataset.busy; m.close();
    };
  };
}
function longPress(el,fn){
  if(!el) return; let t=null;
  const start=()=>{ clearTimeout(t); t=setTimeout(()=>{ el._lp=true; if(navigator.vibrate) try{navigator.vibrate(30)}catch(e){} fn(); },700); };
  const stop=()=>clearTimeout(t);
  el.addEventListener('pointerdown',start); ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,stop));
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.style.userSelect='none'; el.style.webkitUserSelect='none';
}
/* 看相簿：2 片餅乾看 10 分鐘，期間所有照片、影片都能看（只有待在相簿／日常、螢幕亮著才扣時間） */
function buyPass(p){
  if(S.bones<PASS_COST){ sfx.bad(); toast(`還差 ${PASS_COST-S.bones} 片餅乾，去玩小遊戲吧`,2400); return; }
  const m=modal(`${pimg(p,400,'class="del-thumb" alt=""')}<h3>開通 ${PASS_MIN} 分鐘？</h3><p>投 ${PASS_COST} 片餅乾，相簿和日常的照片、影片全部開通 ${PASS_MIN} 分鐘。你現在有 ${S.bones} 片。</p><div class="row"><button class="btn" id="yes">投 ${PASS_COST} 片開通</button><button class="btn ghost" data-close>先不要</button></div>`);
  m.el.querySelector('#yes').onclick=()=>{ m.el.remove(); addBones(-PASS_COST); S.passLeft=(S.passLeft||0)+PASS_MIN*60; save(); sfx.win(); bark(1); renderPass(); view(p); };
}
let passEnded=false;
function renderPass(){}                                            // 不顯示倒數（太有壓力），時間只在背後計
setInterval(()=>{
  if(passOn()&&!document.hidden&&(current==='album'||current==='food')&&!document.querySelector('.reel-ov')){
    S.passLeft--; if(S.passLeft<=0){ S.passLeft=0; passEnded=true; } if(S.passLeft%5===0) save(); renderPass();
  }
  if(passEnded&&!document.querySelector('.overlay,.reel-ov')){          // 時間到：正在看的讓它看完，關掉之後才蓋回白霧
    passEnded=false; save(); toast(`開通時間到了，想再看可以再投 ${PASS_COST} 片餅乾`,2600);
    if(current==='album'||current==='food') go(current,true);
  }
},1000);
function vbadge(p){ return `<span class="vbadge"><svg><use href="#i-play"/></svg>${vdur(p)}</span>`; }
/* 影片框：照縮圖的長寬比決定大小（iPhone 直拍的影片是直的） */
function fitVideo(p,box){
  const set=(a)=>{ const dlg=box.parentElement, W=Math.min(dlg.clientWidth-36,560), H=window.innerHeight*.62; let w=Math.min(W,H*a); box.style.width=w+'px'; box.style.height=(w/a)+'px'; };
  set(p.v&&p.v[1]&&p.v[2]? p.v[1]/p.v[2] : 9/16);
  const im=new Image(); im.onload=()=>{ if(im.naturalWidth) set(im.naturalWidth/im.naturalHeight); }; im.onerror=()=>{ if(!im.dataset.fb){ im.dataset.fb='1'; im.src=`https://drive.google.com/thumbnail?id=${p.id}&sz=w400`; } };
  im.src=purl(p,400);
}

/* ================= 上傳 ================= */
function compress(file,max=1600,q=.85){
  return new Promise((res,rej)=>{
    const u=URL.createObjectURL(file), im=new Image();
    im.onload=()=>{
      const s=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
      const c=document.createElement('canvas'); c.width=Math.round(im.naturalWidth*s); c.height=Math.round(im.naturalHeight*s);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height); URL.revokeObjectURL(u);
      res(c.toDataURL('image/jpeg',q).split(',')[1]);
    };
    im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('讀不出這張照片的格式')); };
    im.src=u;
  });
}
/* EXIF 拍攝時間：讀檔案前 128KB 找 "YYYY:MM:DD HH:MM:SS" */
async function takenTime(file){
  try{
    const buf=await file.slice(0,131072).arrayBuffer();
    const s=new TextDecoder('latin1').decode(buf);
    const m=s.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if(m){ const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]); if(!isNaN(d)&&d.getFullYear()>2005&&d.getTime()<=Date.now()+864e5) return d.getTime(); }
  }catch(e){}
  return 0;   // 照片裡沒有拍攝時間（例如 LINE 轉存的）就不猜，當作日期不明
}
const CAT_LABEL = {'':'相簿','美食':'美食','洗澡':'洗澡','上廁所':'上廁所'};
/* 影片：切成 8MB 一塊，一塊一塊傳給 Apps Script，再由它接到雲端硬碟（沒有大小問題，金鑰也不外露） */
const VCHUNK = 8*1024*1024, MAX_VIDEO_MB = 300;
const toB64 = blob => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]||''); r.onerror=()=>rej(new Error('讀不出這支影片')); r.readAsDataURL(blob); });
async function uploadVideo(f,by,onPct){
  if(f.size>MAX_VIDEO_MB*1024*1024) throw new Error(`影片太大（上限 ${MAX_VIDEO_MB}MB），先在手機上剪短再傳`);
  const {token}=await api({action:'vstart',name:f.name||'abu.mov',mime:f.type||'video/quicktime',size:f.size,by});
  let j=null;
  for(let start=0;start<f.size;start+=VCHUNK){
    const data=await toB64(f.slice(start,Math.min(f.size,start+VCHUNK)));
    for(let tries=0;;tries++){                                        // 網路不穩：同一塊最多再試 2 次
      try{ j=await api({action:'vchunk',token,start,total:f.size,data}); break; }
      catch(e){ if(tries>=2) throw e; await new Promise(r=>setTimeout(r,1500)); }
    }
    onPct(Math.min(100,Math.round((start+VCHUNK)/f.size*100)));
  }
  if(!j||!j.photo) throw new Error('上傳沒有完成');
  return j.photo;
}
function uploadDialog(){
  if(!API_URL){ toast('還沒接上雲端硬碟：請先在 config.js 填入 API 網址'); return; }
  const back=current;
  const m=modal(`<h3>上傳照片／影片</h3>
    ${whoField('upBy','例：媽媽、小明')}
    <label class="picker drop"><svg><use href="#i-album"/></svg><b>選照片或影片</b><span>可以一次選很多個</span><input type="file" id="upFiles" accept="image/*,video/*" multiple></label>
    <div class="uplist" id="uplist"></div>
    <div class="row"><button class="btn" id="upGo" disabled>上傳</button><button class="btn ghost" data-close>取消</button></div>`,()=>go(back,true));
  const el=m.el, listEl=el.querySelector('#uplist'), goBtn=el.querySelector('#upGo');
  bindWho(el);
  let rows=[];
  const isV=f=>/^video\//.test(f.type)||/\.(mov|mp4|m4v|3gp)$/i.test(f.name||'');
  el.querySelector('#upFiles').onchange=e=>{
    const files=[...e.target.files].slice(0,20);
    if(e.target.files.length>20) toast('一次最多 20 個，先傳前 20 個');
    rows.forEach(r=>URL.revokeObjectURL(r.prev));
    listEl.innerHTML=''; rows=files.map(f=>{
      const prev=URL.createObjectURL(f), v=isV(f);
      const row=h(`<div class="uprow">${v?`<video src="${prev}#t=0.1" muted playsinline preload="metadata"></video>`:`<img src="${prev}" alt="">`}<span class="upname">${esc(f.name||(v?'影片':'照片'))}</span><span class="st"></span></div>`);
      listEl.appendChild(row); return {f,prev,row,v};
    });
    goBtn.disabled=!rows.length; goBtn.textContent=`上傳 ${rows.length} 個`;
    const pk=el.querySelector('.picker b'); if(pk) pk.textContent=rows.length?`已選 ${rows.length} 個（重選）`:'選照片或影片';
  };
  goBtn.onclick=async()=>{
    const by=el.querySelector('#upBy').value.trim(); if(by){ S.me=by; save(); }
    goBtn.disabled=true; el.dataset.busy='1';
    let ok=0;
    for(let i=0;i<rows.length;i++){
      const r=rows[i], st=r.row.querySelector('.st');
      goBtn.textContent=`上傳中 ${i+1} / ${rows.length}`; st.textContent='…'; st.className='st';
      try{
        let p;
        if(r.v) p=await uploadVideo(r.f,by,pct=>{ st.textContent=pct+'%'; });
        else{
          const [data,taken]=await Promise.all([compress(r.f),takenTime(r.f)]);
          p=(await api({action:'upload',data,taken,mime:'image/jpeg',name:(r.f.name||'abu.jpg').replace(/\.\w+$/,'')+'.jpg',by})).photo;
        }
        PH.push(p); S.unlocked.push(p.id); ok++;
        st.textContent=r.v? '影片' : CAT_LABEL[p.cat||'']; st.className='st cat cat-'+(r.v?'mem':(p.cat||'mem'));
      }catch(e){ st.textContent='!'; st.className='st err'; st.title=e.message; if(r.v) toast(e.message,2600); }
    }
    save(); lsSet('abu-photos',{photos:PH,config:CONFIG}); PH_STATE='ok';
    delete el.dataset.busy;
    if(ok){ addBones(1); sfx.win(); bark(2); }                      // 上傳一次成功就送 1 片，不管幾個
    const fail=rows.length-ok;
    toast(fail? `成功 ${ok} 個，${fail} 個失敗，標 ! 的可以再試一次${ok?'。送你 1 片餅乾':''}` : `上傳完成！送你 1 片餅乾`,3000);
    rows=rows.filter(r=>r.row.querySelector('.st').classList.contains('err'));
    goBtn.textContent=rows.length?`重試 ${rows.length} 個`:'完成';
    goBtn.disabled=false;
    if(!rows.length) goBtn.onclick=()=>m.close();
  };
}

/* ================= 阿布每天吃什麼 ================= */
const CAT_FOOD = '美食';
const isFood = p => p.cat===CAT_FOOD;
const WEEK = ['日','一','二','三','四','五','六'];
const sameDay = (a,b) => { const x=new Date(a), y=new Date(b); return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate(); };
const hhmm = t => { const d=new Date(t); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
function mealList(){ const m=(CONFIG.meals||'早餐,晚餐').split(/[,，、\s]+/).map(s=>s.trim()).filter(Boolean); return m.length? m: ['早餐','晚餐']; }
function feedsAll(){ return API_URL? FEEDS : (S.localFeeds||[]); }
function todayFeeds(){ return feedsAll().filter(f=>sameDay(f.t,Date.now())).sort((a,b)=>a.t-b.t); }
async function logFeed(meal,by,note){
  if(API_URL){ const j=await api({action:'feed',meal,by,note}); FEEDS=j.feeds||FEEDS; lsSet('abu-feeds',FEEDS); return j.feed; }
  const f={t:Date.now(),by,meal,note}; S.localFeeds=[...(S.localFeeds||[]).filter(x=>Date.now()-x.t<7*864e5),f]; save(); return f;
}
async function removeFeed(f){
  if(API_URL){ const j=await api({action:'unfeed',t:f.t}); FEEDS=j.feeds||FEEDS; lsSet('abu-feeds',FEEDS); return; }
  S.localFeeds=(S.localFeeds||[]).filter(x=>x.t!==f.t); save();
}

/* ================= 日常：美食、洗澡、上廁所，三大類縮圖 ================= */
const CAT_POTTY='上廁所';
const DIARY_CATS=[
  {cat:'美食',   icon:'i-bowl',  cls:'d-food'},
  {cat:'洗澡',   icon:'i-tub',   cls:'d-bath'},
  {cat:'上廁所', icon:'i-potty', cls:'d-potty'},
];
function Food(){
  const s=h(`<section class="screen"><h2>日常</h2><figure class="famframe"><img src="img/family.jpg" alt="阿布和家人的手繪全家福"><figcaption>阿布之家</figcaption></figure></section>`);
  DIARY_CATS.forEach(c=>{
    const photos=pool().filter(p=>p.cat===c.cat).sort((a,b)=>ptime(b)-ptime(a));
    s.appendChild(h(`<section class="dsec ${c.cls}"><h3><svg><use href="#${c.icon}"/></svg>${c.cat}</h3>
      <div class="dgrid">${photos.length? photos.map(p=>`<div class="dthumb${isVid(p)&&!isOpen(p)?' locked':''}" data-id="${esc(p.id)}">${pimg(p,300,`alt="${esc(p.cap||c.cat)}" loading="lazy"`)}${isVid(p)? (isOpen(p)? '' : `<span class="veil"><svg><use href="#i-lock-d"/></svg>${PASS_COST} 片</span>`)+vbadge(p) : ''}</div>`).join('') : '<p class="meta">還沒有照片</p>'}</div></section>`));
  });
  main.appendChild(s);
  s.querySelectorAll('.dthumb').forEach(d=>{ const p=pool().find(x=>x.id===d.dataset.id); if(!p) return;
    if(isVid(p)) d.onclick=()=>{ if(d._lp){ d._lp=false; return; } isOpen(p)? view(p): buyPass(p); };   // 影片點一下就播
    if(API_URL&&!p.sample) longPress(d,()=>photoMenu(p,()=>go('food',true))); });
}

/* ---------- 洗澡 ---------- */
const CAT_BATH='洗澡';
const ptime = p => p.taken||p.t||0;
const fmtDay = t => { const d=new Date(t), y=new Date().getFullYear(); return `${d.getFullYear()!==y?d.getFullYear()+'/':''}${d.getMonth()+1}/${d.getDate()}（${WEEK[d.getDay()]}）`; };
const dayStart = t => { const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
function bathInfo(){
  const every=Math.max(3,parseInt(CONFIG.bathDays,10)||30);
  const photos=pool().filter(p=>p.cat===CAT_BATH&&!p.sample).sort((a,b)=>ptime(b)-ptime(a));
  const logs=feedsAll().filter(f=>f.meal===CAT_BATH).sort((a,b)=>b.t-a.t);
  const cands=[];
  if(photos[0]) cands.push({t:ptime(photos[0]),by:photos[0].by,src:'photo'});
  if(logs[0]) cands.push({t:logs[0].t,by:logs[0].by,src:'log',log:logs[0]});
  const last=cands.sort((a,b)=>b.t-a.t)[0]||null;
  const days= last? Math.round((dayStart(Date.now())-dayStart(last.t))/864e5) : null;
  let state='none', say='我還沒有洗澡紀錄喔';
  if(last){
    if(days===0){ state='fresh'; say='我洗香香了，聞聞看！'; }
    else if(days<=every*.6){ state='fresh'; say=pick(['我現在香香的','毛還很蓬鬆喔']); }
    else if(days<=every){ state='soon'; say='快要該洗澡囉'; }
    else { state='due'; say=`已經超過 ${every} 天了，我有點狗味了…`; }
  }
  return {last,days,every,state,say,photo:photos[0]||null};
}
function bathDialog(B){
  const todayLog=todayFeeds().find(f=>f.meal===CAT_BATH);
  if(!todayLog && B.days===0 && B.last && B.last.src==='photo'){
    const m=modal(`<img class="face-img" src="${face('face_62')}" alt=""><h3>今天已經洗過了！</h3><p>${B.last.by?esc(B.last.by)+' ':''}上傳了今天的洗澡照，已經算進去了。</p><div class="row"><button class="btn" data-close>好</button>${B.photo?'<button class="btn ghost" id="seeBath">看照片</button>':''}</div>`);
    const sb=m.el.querySelector('#seeBath'); if(sb) sb.onclick=()=>{ m.el.remove(); view(B.photo); };
    return;
  }
  if(todayLog){
    const m=modal(`<img class="face-img" src="${face('face_62')}" alt=""><h3>今天已經洗過了！</h3><p>${todayLog.by?esc(todayLog.by)+' ':''}${hhmm(todayLog.t)} 記的。阿布現在香香的。</p>
      <div class="row"><button class="btn" data-close>好</button>${S.me&&todayLog.by===S.me?'<button class="btn ghost" id="undoBath">記錯了，刪除</button>':''}</div>`);
    const u=m.el.querySelector('#undoBath');
    if(u) u.onclick=async()=>{ u.disabled=true; try{ await removeFeed(todayLog); m.close(); toast('已刪除'); go('food',true); }catch(e){ u.disabled=false; toast('刪除失敗：'+e.message); } };
    return;
  }
  const m=modal(`<img class="face-img" src="${face('face_143')}" alt=""><h3>阿布今天洗澡了？</h3>
    ${whoField('bBy','例：爸爸')}
    <label class="field">備註（可以不寫）<input id="bNote" maxlength="100" placeholder="例：去寵物美容、順便剪指甲"></label>
    <p class="meta">有拍洗澡照的話，直接上傳照片也會自動算進來。</p>
    <div class="row"><button class="btn" id="bGo">記下來</button><button class="btn ghost" data-close>取消</button></div>`,()=>go('food',true));
  const goBtn=m.el.querySelector('#bGo');
  bindWho(m.el);
  goBtn.onclick=async()=>{
    const by=m.el.querySelector('#bBy').value.trim(), note=m.el.querySelector('#bNote').value.trim();
    if(by){ S.me=by; save(); }
    goBtn.disabled=true; goBtn.textContent='記錄中…'; m.el.dataset.busy='1';
    try{
      await logFeed(CAT_BATH,by,note);
      delete m.el.dataset.busy; bark(2); addLove(2);
      m.el.querySelector('.dialog').innerHTML=`<img class="face-img" src="${face('face_60')}" alt=""><h3>洗香香了！</h3><p>謝謝${by?esc(by):'你'}幫我洗澡，雖然我剛剛一直想逃跑。</p><button class="btn" id="ok">好</button>`;
      m.el.querySelector('#ok').onclick=m.close;
    }catch(e){ delete m.el.dataset.busy; goBtn.disabled=false; goBtn.textContent='記下來'; toast('記錄失敗：'+e.message); }
  };
}

function mealDialog(meal,isMain){
  const last=todayFeeds().filter(f=>f.meal===meal).pop();
  if(isMain && last){                                   // 已經吃過了：溫柔提醒，避免重複餵
    const m=modal(`<img class="face-img" src="${face('face_143')}" alt=""><h3>${esc(meal)}已經吃過了喔！</h3>
      <p>${last.by?esc(last.by)+' ':''}${hhmm(last.t)} 餵的${last.note?`（${esc(last.note)}）`:''}。<br>阿布的眼神說還想吃，但不用再餵囉。</p>
      <div class="row"><button class="btn" data-close>知道了</button><button class="btn ghost" id="again">還是要記一筆</button></div>`);
    m.el.querySelector('#again').onclick=()=>{ m.el.remove(); mealForm(meal); };
    return;
  }
  mealForm(meal);
}
function mealForm(meal){
  const ph = meal==='點心'? '例：兩片餅乾、一小塊雞胸肉' : '例：飼料一碗、加了一點雞胸肉';
  const m=modal(`<img class="face-img" src="${face('face_66')}" alt=""><h3>阿布吃了${esc(meal)}？</h3>
    ${whoField('fBy','例：媽媽')}
    <label class="field">吃了什麼（可以不寫）<input id="fNote" maxlength="100" placeholder="${ph}"></label>
    <div class="row"><button class="btn" id="fGo">記下來</button><button class="btn ghost" data-close>取消</button></div>`,()=>go('food',true));
  const goBtn=m.el.querySelector('#fGo');
  bindWho(m.el);
  goBtn.onclick=async()=>{
    const by=m.el.querySelector('#fBy').value.trim(), note=m.el.querySelector('#fNote').value.trim();
    if(by){ S.me=by; save(); }
    goBtn.disabled=true; goBtn.textContent='記錄中…'; m.el.dataset.busy='1';
    try{
      await logFeed(meal,by,note);
      delete m.el.dataset.busy; bark(1); addLove(1);
      m.el.querySelector('.dialog').innerHTML=`<img class="face-img" src="${face('face_60')}" alt=""><h3>謝謝${by?esc(by):'你'}餵我！</h3><p>${API_URL?'全家都看得到這筆紀錄了。':'已經記在這支手機裡。'}</p><button class="btn" id="ok">好</button>`;
      m.el.querySelector('#ok').onclick=m.close;
    }catch(e){ delete m.el.dataset.busy; goBtn.disabled=false; goBtn.textContent='記下來'; toast('記錄失敗：'+e.message); }
  };
}

/* ================= 小遊戲：幫阿布裝飯 ================= */
function Bowl(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('幫阿布裝飯','bstat'));
  const wrap=h(`<div class="catch-wrap bowl-wrap"><canvas></canvas><div class="bowl-tip" id="bowlTip">按住畫面倒飼料，放開就停。<br>倒到粉紅色那一格最剛好。</div></div>`); s.appendChild(wrap);
  main.appendChild(s);
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d'), tip=$('#bowlTip');
  const faces={}; ['face_143','face_60','face_68','face_66','face_62'].forEach(k=>{ const im=new Image(); im.src=face(k); faces[k]=im; });
  const KIB=['#8A5528','#9E6431','#74461F','#A8703A'];
  const ROUNDS=3;
  let W=0,H=0,dpr=1, round=0, target=.6, level=0, parts=[], spill=[], pouring=false, pourT=0, acc=0, phase='ready', settleT=0, total=0, raf=0, last=0, faceK='face_143', line='快點快點！', pile=[];
  function size(){ const r=wrap.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  size(); const ro=new ResizeObserver(size); ro.observe(wrap);
  const cup=()=>{ const w=Math.min(W*.46,190), h=Math.min(H*.5,240); return {x:W/2-w/2, y:H-h-24, w, h}; };
  const upd=()=>$('#bstat').textContent=`第 ${Math.min(round+1,ROUNDS)} / ${ROUNDS} 份　得 ${total} 片`;
  function newRound(){
    target=.35+Math.random()*.45; level=0; parts=[]; spill=[]; pile=[]; pourT=0; acc=0; phase='ready'; faceK='face_143'; line='快點快點！';
    tip.hidden=round>0; upd();
  }
  function drawBag(){
    const bx=W/2-18, by=26;
    ctx.save(); ctx.translate(bx,by); ctx.rotate(pouring? .5: .15);
    ctx.fillStyle='#C9A26B'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(-34,-10); ctx.lineTo(30,-10); ctx.lineTo(38,70); ctx.lineTo(-40,70); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#FFFDF7'; ctx.beginPath(); ctx.ellipse(0,30,20,14,0,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#2B2723'; ctx.font='bold 13px "Huninn",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('飼料',0,31);
    ctx.restore();
    return {x:bx+30, y:by+62};
  }
  function drawCup(){
    const c=cup();
    // 目標區
    const ty=c.y+c.h*(1-target), band=c.h*.045;
    ctx.fillStyle='rgba(238,133,151,.28)'; ctx.fillRect(c.x-10,ty-band,c.w+20,band*2);
    ctx.strokeStyle='#EE8597'; ctx.setLineDash([6,5]); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(c.x-10,ty); ctx.lineTo(c.x+c.w+10,ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#B34A5C'; ctx.font='12px "Huninn",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('阿布的份量',c.x+c.w+12,ty);
    // 飼料
    const lv=Math.min(level,1.08), fy=c.y+c.h*(1-lv);
    ctx.save(); ctx.beginPath(); ctx.rect(c.x+3,c.y-30,c.w-6,c.h+27); ctx.clip();
    ctx.fillStyle='#8A5528';
    ctx.beginPath(); ctx.moveTo(c.x,c.y+c.h);
    for(let x=0;x<=c.w;x+=6) ctx.lineTo(c.x+x, fy - Math.sin(x/c.w*Math.PI)*Math.min(10,level*18) + Math.sin(x*1.7)*1.5);
    ctx.lineTo(c.x+c.w,c.y+c.h); ctx.closePath(); ctx.fill();
    pile.forEach(k=>{ if(k.y>fy+2){ ctx.fillStyle=k.c; ctx.beginPath(); ctx.ellipse(k.x,k.y,4.5,3.3,k.r,0,7); ctx.fill(); } });
    ctx.restore();
    // 量杯
    ctx.fillStyle='rgba(255,255,255,.35)'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(c.x,c.y+c.h-10); ctx.quadraticCurveTo(c.x,c.y+c.h,c.x+10,c.y+c.h); ctx.lineTo(c.x+c.w-10,c.y+c.h); ctx.quadraticCurveTo(c.x+c.w,c.y+c.h,c.x+c.w,c.y+c.h-10); ctx.lineTo(c.x+c.w,c.y); ctx.stroke();
    ctx.fillStyle='#2B2723'; ctx.font='12px sans-serif'; ctx.textAlign='right';
    [['¼',.25],['½',.5],['¾',.75],['1 杯',1]].forEach(([t,v])=>{ const y=c.y+c.h*(1-v); ctx.beginPath(); ctx.moveTo(c.x,y); ctx.lineTo(c.x+14,y); ctx.lineWidth=2; ctx.stroke(); ctx.fillText(t,c.x-6,y); });
    return c;
  }
  function drawAbu(){
    const r=30, x=W-r-14, y=r+16, im=faces[faceK];
    ctx.save(); ctx.beginPath(); ctx.arc(x,y,r+4,0,7); ctx.fillStyle='#F2C230'; ctx.fill(); ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.clip(); if(im.complete) ctx.drawImage(im,x-r,y-r,r*2,r*2); ctx.restore();
    ctx.font='14px "Huninn",sans-serif'; const tw=ctx.measureText(line).width+18;
    const bx=Math.max(8,x-r-tw-8), by=y-14;
    ctx.fillStyle='#FFFDF7'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,tw,28,12): ctx.rect(bx,by,tw,28); ctx.fill();
    ctx.fillStyle='#2B2723'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(line,bx+9,by+14);
  }
  function react(){
    const d=level-target;
    if(level>1.02){ faceK='face_143'; line='滿出來了啦！'; }
    else if(d>.06){ faceK='face_62'; line='太多了，會變胖胖'; }
    else if(Math.abs(d)<=.045){ faceK='face_68'; line='停！剛剛好！'; }
    else if(d>-.15){ faceK='face_60'; line='差不多了！'; }
    else { faceK='face_143'; line= level>0? '還要還要' : '快點快點！'; }
  }
  function frame(ts){
    const dt=Math.min(.05,(ts-last)/1000||0); last=ts;
    ctx.clearRect(0,0,W,H);
    const spout=drawBag(); const c=drawCup();
    if(pouring){
      pourT+=dt; const rate=18+Math.min(46,pourT*30);        // 越倒越快，跟真的倒飼料一樣
      acc+=rate*dt;
      while(acc>=1){ acc--; parts.push({x:spout.x+(Math.random()-.5)*8, y:spout.y, vx:(W/2-spout.x)*.9+(Math.random()-.5)*30, vy:40+Math.random()*30, c:pick(KIB), r:Math.random()*3}); }
    }
    const surf=()=>c.y+c.h*(1-Math.min(level,1.08));
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i]; p.vy+=900*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.98;
      if(p.x>c.x+4&&p.x<c.x+c.w-4&&p.y>=surf()){
        parts.splice(i,1);
        if(level>1.05){ spill.push({x:p.x,y:c.y,vx:(Math.random()<.5?-1:1)*(60+Math.random()*60),vy:-40,c:p.c}); continue; }
        level+=.0055; pile.push({x:p.x+(Math.random()-.5)*6,y:surf()+4+Math.random()*6,c:p.c,r:Math.random()*3});
        if(pile.length>400) pile.splice(0,1);
        continue;
      }
      if(p.y>H+10){ parts.splice(i,1); continue; }
      ctx.fillStyle=p.c; ctx.beginPath(); ctx.ellipse(p.x,p.y,4.5,3.3,p.r,0,7); ctx.fill();
    }
    for(let i=spill.length-1;i>=0;i--){ const p=spill[i]; p.vy+=900*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.y>H-8){ p.y=H-8; p.vx*=.8; p.vy=0; } ctx.fillStyle=p.c; ctx.beginPath(); ctx.ellipse(p.x,p.y,4.5,3.3,0,0,7); ctx.fill(); }
    if(phase==='pour'||phase==='settle') react();
    drawAbu();
    if(phase==='settle' && !parts.length){ settleT+=dt; if(settleT>.5) judge(); }
    raf=requestAnimationFrame(frame);
  }
  function judge(){
    phase='done';
    const d=level-target; let got, title, face_, text;
    if(level>1.02){ got=1; title='滿出來了！'; face_='face_143'; text='灑了一地，阿布忙著撿地上的。'; }
    else if(Math.abs(d)<=.045){ got=4; title='剛剛好！'; face_='face_66'; text='完美的份量，阿布吃得好開心。'; }
    else if(Math.abs(d)<=.1){ got=2; title='差不多！'; face_='face_60'; text= d>0? '稍微多了一點點。':'稍微少了一點點。'; }
    else if(d>0){ got=1; title='太多了'; face_='face_62'; text='吃太多會變胖胖，下次少倒一點。'; }
    else { got=1; title='這樣不夠吃啦'; face_='face_143'; text='阿布舔舔碗，看著你。'; }
    total+=got; round++; upd();
    if(got>=4){ bark(2); sfx.win(); } else if(got>=2){ bark(1); sfx.good(); } else sfx.bad();
    if(round>=ROUNDS){ setTimeout(()=>winDialog({title:`裝了 ${ROUNDS} 份飯`,text:`最後一份：${title}${text}`,bones:total,faceKey:face_,again:()=>go('bowl'),rank:{game:'bowl',score:total}}),700); return; }
    const m=modal(`<img class="face-img" src="${face(face_)}" alt=""><h3>${title}</h3><p>${text}</p><div class="gain">+${got}<img class="ico" src="img/biscuit/bear.png" alt=""></div><button class="btn" id="next">下一份</button>`,()=>{ if(phase==='done') newRound(); });
    m.el.querySelector('#next').onclick=()=>m.close();
  }
  const down=e=>{ e.preventDefault(); if(phase==='ready'){ phase='pour'; tip.hidden=true; } if(phase!=='pour') return; ac(); pouring=true; };
  const up=()=>{ if(!pouring) return; pouring=false; phase='settle'; settleT=0; };
  wrap.addEventListener('pointerdown',down); ['pointerup','pointercancel','pointerleave'].forEach(ev=>wrap.addEventListener(ev,up));
  wrap.addEventListener('contextmenu',e=>e.preventDefault());
  newRound(); last=performance.now(); raf=requestAnimationFrame(frame);
  cleanup=()=>{ cancelAnimationFrame(raf); ro.disconnect(); };
}

/* ================= 小遊戲：阿布去兜風（最愛坐車，最不愛下車） =================
 * 車上時間從 25 秒開始倒數：吃到 💨🐕🍗 加時間，撞到對向來車扣時間，越開越快。
 * 時間用完就到目的地：連打畫面把阿布拉下車，成功總成績再 +10 秒。成績＝阿布在車上待了幾秒，每 10 秒換 1 片餅乾。 */
function Car(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('阿布去兜風','carstat'));
  const wrap=h(`<div class="catch-wrap car-wrap"><canvas></canvas></div>`); s.appendChild(wrap);
  s.appendChild(h(`<div class="legend"><span><b>加時間</b> 💨 +1秒　🐕 +2秒　🍗 +3秒</span><span class="no"><b class="no">閃開</b> 🚗 🛵 🚲 撞到 −3秒</span></div>`));
  main.appendChild(s);
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d');
  const F={}; ['face_car1','face_car2','face_car3','face_143','face_62','face_66'].forEach(k=>{ const im=new Image(); im.src=face(k); F[k]=im; });
  const GOOD=[['💨',1,['風好舒服～','耳朵要飛起來了','呼～～']],['🐕',2,['那隻狗在看我！','嗨～狗朋友']],['🍗',3,['什麼東西好香！','停車！我要吃那個']]];
  const CARS=['#E0715A','#F4F1EA','#8DBF7A','#F2C230','#B8A6D9'];
  const START=25, CRASH=3, TUG=6, BONUS=10;
  let W=0,H=0,dpr=1, lane=1, carY=0, items=[], left=START, ride=0, t=0, last=0, raf=0, phase='intro', speed=0, spawnT=0, dist=0, hurt=0, pops=[];
  let pulled=false, faceK='face_car1', faceT=0, say='', sayT=0, shake=0, tug=.4, tugT=0, won=false, houseX=0;
  function size(){ const r=wrap.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); if(!carY) carY=laneY(lane); }
  const roadTop=()=>H*.42, laneH=()=>(H-18-roadTop())/3, laneY=i=>roadTop()+laneH()*(i+.5);
  size(); const ro=new ResizeObserver(size); ro.observe(wrap);
  const stat=$('#carstat'); const upd=()=>{ stat.textContent= phase==='tug'? '拉阿布下車！' : ''; }; upd();
  const talk=(txt,k,ms=1.2)=>{ say=txt; sayT=ms; if(k){ faceK=k; faceT=ms; } };
  const pop=(txt,col)=>pops.push({txt,col,y:0,v:1});

  /* 換車道：點車子上面往上、點下面往下；拉下車時連打 */
  wrap.addEventListener('pointerdown',e=>{
    e.preventDefault(); ac();
    if(phase==='tug'){ tug=Math.min(1,tug+.07); if(tug>=1) pulled=true; shake=.12; if(Math.random()<.3) tone(500+Math.random()*200,.05,'triangle',.08,120); return; }
    if(phase!=='drive') return;
    const r=wrap.getBoundingClientRect(); const y=e.clientY-r.top; lane=Math.max(0,Math.min(2,lane+(y<carY?-1:1))); sfx.flip();
  });
  const onKey=e=>{ if(phase!=='drive') return; if(e.key==='ArrowUp') lane=Math.max(0,lane-1); if(e.key==='ArrowDown') lane=Math.min(2,lane+1); };
  window.addEventListener('keydown',onKey);

  /* 背景：遠山、樹和房子（兩層視差），路面車道線 */
  const deco=[...Array(14)].map((_,i)=>({x:i*70+Math.random()*30,k:Math.random()<.65?'tree':'house',s:.8+Math.random()*.5,c:pick(['#E8B86B','#D98C6A','#9CC3D5','#E3D3B0'])}));
  function drawWorld(dt){
    const g=ctx.createLinearGradient(0,0,0,H*.42); g.addColorStop(0,'#BFE0F2'); g.addColorStop(1,'#E6F2E4'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H*.42);
    ctx.fillStyle='#B9D6A4'; ctx.beginPath(); ctx.moveTo(0,H*.3);                                  // 遠山
    for(let x=0;x<=W+40;x+=40) ctx.lineTo(x,H*.3-12-10*Math.sin((x+dist*.1)/60)); ctx.lineTo(W,H*.42); ctx.lineTo(0,H*.42); ctx.fill();
    const span=deco.length*70;
    deco.forEach(d=>{
      const x=((d.x-dist*.45)%span+span)%span-60, base=H*.42;
      if(d.k==='tree'){ ctx.fillStyle='#8A6242'; ctx.fillRect(x-3,base-26*d.s,6,26*d.s); ctx.fillStyle='#7FB36A'; ctx.beginPath(); ctx.arc(x,base-32*d.s,16*d.s,0,7); ctx.fill(); }
      else { const w=40*d.s, hh=28*d.s; ctx.fillStyle=d.c; ctx.fillRect(x-w/2,base-hh,w,hh); ctx.fillStyle='#B35A17'; ctx.beginPath(); ctx.moveTo(x-w/2-4,base-hh); ctx.lineTo(x,base-hh-16*d.s); ctx.lineTo(x+w/2+4,base-hh); ctx.fill(); ctx.fillStyle='#FFFDF7'; ctx.fillRect(x-6,base-hh+8,12,10); }
    });
    ctx.fillStyle='#8C8A86'; ctx.fillRect(0,roadTop()-6,W,H-roadTop()+6);                          // 路面
    ctx.fillStyle='#C9DDB6'; ctx.fillRect(0,roadTop()-10,W,6); ctx.fillRect(0,H-12,W,12);
    ctx.strokeStyle='rgba(255,253,247,.8)'; ctx.lineWidth=3; ctx.setLineDash([22,18]); ctx.lineDashOffset=dist%40;
    for(let i=1;i<3;i++){ const y=roadTop()+laneH()*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  function drawHouse(){
    if(!houseX) return;
    const x=houseX, base=roadTop()-8, w=110, hh=78;
    ctx.fillStyle='#FBEBD6'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5; ctx.fillRect(x,base-hh,w,hh); ctx.strokeRect(x,base-hh,w,hh);
    ctx.fillStyle='#D9772B'; ctx.beginPath(); ctx.moveTo(x-10,base-hh); ctx.lineTo(x+w/2,base-hh-40); ctx.lineTo(x+w+10,base-hh); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#9C6B45'; ctx.fillRect(x+w/2-13,base-38,26,38); ctx.fillStyle='#2B2723'; ctx.font='bold 13px "Huninn",sans-serif'; ctx.textAlign='center'; ctx.fillText('目的地',x+w/2,base-hh+22);
  }
  /* 車子（側面、往右開），阿布從後車窗探出頭，風吹得臉晃來晃去 */
  function drawCar(dt){
    const L=laneH(), cw=Math.min(W*.38,L*2.3), ch=L*.62, x=W*.32, y=carY+ (shake>0? (Math.random()-.5)*shake*30 : Math.sin(t*14)*speed*.004);
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0,ch*.55,cw*.52,6,0,0,7); ctx.fill();
    ctx.fillStyle='#7FB3D5'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(-cw/2,-ch*.15,cw,ch*.6,10) : ctx.rect(-cw/2,-ch*.15,cw,ch*.6); ctx.fill(); ctx.stroke();       // 車身
    ctx.beginPath(); ctx.moveTo(-cw*.36,-ch*.15); ctx.lineTo(-cw*.26,-ch*.62); ctx.lineTo(cw*.16,-ch*.62); ctx.lineTo(cw*.32,-ch*.15); ctx.closePath(); ctx.fill(); ctx.stroke();   // 車頂
    ctx.fillStyle='#E3F1F8'; ctx.beginPath(); ctx.moveTo(-cw*.02,-ch*.2); ctx.lineTo(-cw*.02,-ch*.55); ctx.lineTo(cw*.14,-ch*.55); ctx.lineTo(cw*.26,-ch*.2); ctx.closePath(); ctx.fill(); ctx.stroke();  // 前車窗
    ctx.fillStyle='#F2C230'; ctx.fillRect(cw*.4,-ch*.05,cw*.08,ch*.12);                               // 車燈
    [-cw*.3,cw*.3].forEach(wx=>{ ctx.save(); ctx.translate(wx,ch*.45); ctx.rotate(dist/18); ctx.fillStyle='#2B2723'; ctx.beginPath(); ctx.arc(0,0,ch*.22,0,7); ctx.fill(); ctx.strokeStyle='#C9C4BC'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-ch*.12,0); ctx.lineTo(ch*.12,0); ctx.moveTo(0,-ch*.12); ctx.lineTo(0,ch*.12); ctx.stroke(); ctx.restore(); });
    ctx.fillStyle='#E3F1F8'; ctx.beginPath(); ctx.moveTo(-cw*.3,-ch*.2); ctx.lineTo(-cw*.23,-ch*.55); ctx.lineTo(-cw*.06,-ch*.55); ctx.lineTo(-cw*.06,-ch*.2); ctx.closePath(); ctx.fill(); ctx.stroke();   // 後車窗
    const r=Math.min(ch*.46,L*.36), hx=-cw*.17, hy=-ch*.5-r*.45+Math.sin(t*9)*2;                    // 阿布的頭：從後車窗探出來
    if(speed>40){ ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=2.5; for(let k=0;k<3;k++){ const yy=hy-r*.5+k*r*.5, len=18+speed*.08+Math.sin(t*20+k)*6; ctx.beginPath(); ctx.moveTo(hx-r-6,yy); ctx.lineTo(hx-r-6-len,yy); ctx.stroke(); } }
    ctx.save(); ctx.rotate(-.08+Math.sin(t*6)*.04); ctx.beginPath(); ctx.arc(hx,hy,r+4,0,7); ctx.fillStyle='#F2C230'; ctx.fill(); ctx.beginPath(); ctx.arc(hx,hy,r,0,7); ctx.clip();
    const im=F[faceK]; if(im&&im.complete) ctx.drawImage(im,hx-r,hy-r,r*2,r*2); ctx.restore();
    ctx.restore();
    return {x,y,cw,ch,hx:x+hx,hy:y+hy,r};
  }
  function bubble(txt,x,y){
    ctx.font='15px "Huninn",sans-serif'; const tw=ctx.measureText(txt).width+20, bx=Math.max(8,Math.min(W-tw-8,x-tw/2)), by=Math.max(8,y-44);
    ctx.fillStyle='#FFFDF7'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,tw,30,12): ctx.rect(bx,by,tw,30); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#2B2723'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(txt,bx+10,by+15);
  }
  /* 對向來車：汽車、機車、腳踏車，都朝左開過來 */
  const HELMETS=['#E0715A','#F2C230','#7FB3D5','#FFFDF7','#8DBF7A'];
  const vw=o=>{ const L=laneH(); return o.k==='car'? Math.min(W*.3,L*1.9) : o.k==='moto'? L*1.15 : L*1.0; };
  function rider(x,y,s,helmet,pedal){                                // 騎士：安全帽、身體、手、腳
    ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5; ctx.lineCap='round';
    ctx.fillStyle='#6B8FB3'; ctx.beginPath(); ctx.moveTo(x+s*.05,y-s*.95); ctx.lineTo(x+s*.25,y-s*.35); ctx.lineTo(x-s*.12,y-s*.35); ctx.closePath(); ctx.fill(); ctx.stroke();   // 身體
    ctx.beginPath(); ctx.moveTo(x+s*.02,y-s*.8); ctx.lineTo(x-s*.32,y-s*.62); ctx.stroke();                                   // 手伸向把手
    const a=pedal||0; ctx.beginPath(); ctx.moveTo(x+s*.1,y-s*.38); ctx.lineTo(x-s*.12+Math.cos(a)*s*.14,y-s*.08+Math.sin(a)*s*.1); ctx.stroke();   // 腳
    ctx.fillStyle='#F3D9C0'; ctx.beginPath(); ctx.arc(x+s*.02,y-s*1.1,s*.16,0,7); ctx.fill(); ctx.stroke();                    // 臉
    ctx.fillStyle=helmet; ctx.beginPath(); ctx.arc(x+s*.04,y-s*1.14,s*.18,Math.PI*.95,Math.PI*2.05); ctx.fill(); ctx.stroke();  // 安全帽
  }
  function drawMoto(o){
    const L=laneH(), s=L*.62, x=o.x, y=laneY(o.lane)+L*.18;
    ctx.save(); ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x,y+s*.3,s*.8,5,0,0,7); ctx.fill();
    ctx.strokeStyle='#2B2723'; ctx.lineWidth=3;
    [-s*.55,s*.5].forEach(wx=>{ ctx.fillStyle='#2B2723'; ctx.beginPath(); ctx.arc(x+wx,y+s*.12,s*.2,0,7); ctx.fill(); ctx.fillStyle='#C9C4BC'; ctx.beginPath(); ctx.arc(x+wx,y+s*.12,s*.08,0,7); ctx.fill(); });
    ctx.fillStyle=o.c; ctx.beginPath(); ctx.moveTo(x-s*.7,y-s*.05); ctx.quadraticCurveTo(x-s*.55,y-s*.45,x-s*.3,y-s*.3); ctx.lineTo(x+s*.1,y-s*.1); ctx.lineTo(x+s*.5,y-s*.35); ctx.quadraticCurveTo(x+s*.8,y-s*.3,x+s*.7,y+s*.05); ctx.lineTo(x-s*.7,y+s*.05); ctx.closePath(); ctx.fill(); ctx.stroke();   // 車身
    ctx.fillStyle='#2B2723'; ctx.fillRect(x+s*.05,y-s*.42,s*.45,s*.1);                                                           // 座墊
    ctx.beginPath(); ctx.moveTo(x-s*.5,y-s*.35); ctx.lineTo(x-s*.42,y-s*.72); ctx.stroke();                                       // 把手
    ctx.fillStyle='#FFF3B0'; ctx.beginPath(); ctx.arc(x-s*.66,y-s*.22,s*.07,0,7); ctx.fill();
    rider(x+s*.2,y-s*.3,s*.72,o.h);
    ctx.restore();
  }
  function drawBike(o){
    const L=laneH(), s=L*.6, x=o.x, y=laneY(o.lane)+L*.18, a=dist/14;
    ctx.save(); ctx.fillStyle='rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x,y+s*.35,s*.75,4,0,0,7); ctx.fill();
    ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5;
    [-s*.5,s*.5].forEach(wx=>{ ctx.beginPath(); ctx.arc(x+wx,y+s*.05,s*.28,0,7); ctx.stroke(); });                              // 兩個細輪子
    ctx.strokeStyle=o.c; ctx.lineWidth=3.5; ctx.beginPath(); ctx.moveTo(x-s*.5,y+s*.05); ctx.lineTo(x-s*.35,y-s*.45); ctx.lineTo(x+s*.15,y-s*.35); ctx.lineTo(x+s*.05,y+s*.05); ctx.lineTo(x-s*.5,y+s*.05); ctx.moveTo(x+s*.05,y+s*.05); ctx.lineTo(x+s*.5,y+s*.05); ctx.moveTo(x+s*.15,y-s*.35); ctx.lineTo(x+s*.5,y+s*.05); ctx.stroke();   // 車架
    ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x-s*.35,y-s*.45); ctx.lineTo(x-s*.42,y-s*.65); ctx.stroke();                  // 把手
    rider(x+s*.12,y-s*.3,s*.72,o.h,a);
    ctx.restore();
  }
  function drawOncoming(o){
    if(o.k==='moto') return drawMoto(o);
    if(o.k==='bike') return drawBike(o);
    const L=laneH(), cw=Math.min(W*.3,L*1.9), ch=L*.55, x=o.x, y=laneY(o.lane);
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle='rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0,ch*.55,cw*.5,5,0,0,7); ctx.fill();
    ctx.fillStyle=o.c; ctx.strokeStyle='#2B2723'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(-cw/2,-ch*.15,cw,ch*.6,10): ctx.rect(-cw/2,-ch*.15,cw,ch*.6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cw*.36,-ch*.15); ctx.lineTo(cw*.26,-ch*.62); ctx.lineTo(-cw*.16,-ch*.62); ctx.lineTo(-cw*.32,-ch*.15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#E3F1F8'; ctx.beginPath(); ctx.moveTo(cw*.02,-ch*.2); ctx.lineTo(cw*.02,-ch*.55); ctx.lineTo(-cw*.14,-ch*.55); ctx.lineTo(-cw*.26,-ch*.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#FFF3B0'; ctx.fillRect(-cw*.48,-ch*.05,cw*.08,ch*.12);
    ctx.fillStyle='rgba(255,243,176,.35)'; ctx.beginPath(); ctx.moveTo(-cw*.48,0); ctx.lineTo(-cw*.48-40,-14); ctx.lineTo(-cw*.48-40,14); ctx.fill();   // 車燈光
    [-cw*.3,cw*.3].forEach(wx=>{ ctx.save(); ctx.translate(wx,ch*.45); ctx.rotate(-dist/16); ctx.fillStyle='#2B2723'; ctx.beginPath(); ctx.arc(0,0,ch*.22,0,7); ctx.fill(); ctx.strokeStyle='#C9C4BC'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-ch*.12,0); ctx.lineTo(ch*.12,0); ctx.stroke(); ctx.restore(); });
    ctx.restore();
  }
  function spawn(){
    const ln=Math.floor(Math.random()*3);
    if(items.some(o=>o.x>W-(o.car?130:60)&&o.lane===ln)) return;
    if(Math.random()<Math.min(.55,.36+t/150)){                      // 對向來車越來越多
      const free=[0,1,2].filter(k=>!items.some(o=>o.car&&o.x>W-120&&o.lane===k));
      if(free.length<2) return;                                       // 一定留一條路可以閃
      const k=pick(['car','car','moto','moto','bike']);            // 汽車、機車、腳踏車
      items.push({car:true,k,x:W+80,lane:ln,c:pick(CARS),h:pick(HELMETS),v: k==='car'? 110+Math.random()*60 : k==='moto'? 70+Math.random()*50 : 15+Math.random()*25});
    }else{ const it=pick(GOOD); items.push({x:W+30,lane:ln,e:it[0],val:it[1],line:pick(it[2]),bob:Math.random()*6}); }
  }
  function frame(ts){
    const dt=Math.min(.05,(ts-last)/1000||0); last=ts; t+=dt;
    if(phase==='drive'){
      ride+=dt; left-=dt; hurt=Math.max(0,hurt-dt); shake=Math.max(0,shake-dt);
      const goal=170+t*6;                                             // 越開越快
      speed+=(goal-speed)*Math.min(1,dt*2);
      spawnT-=dt; if(spawnT<=0){ spawn(); spawnT=Math.max(.36,1-t*.012); }
      if(left<=3&&left+dt>3) talk('快到了…我還不想下車','face_143',2);
      if(left<=0){ left=0; phase='arrive'; items=items.filter(o=>!o.car); houseX=W+40; }
      upd();
    }else if(phase==='arrive'){
      speed=Math.max(0,speed-140*dt); houseX-=speed*dt;
      const stopX=W*.32-55; if(houseX<stopX){ houseX=stopX; speed=0; }
      if(speed===0){ phase='tug'; tugT=0; tug=.4; items=[]; upd(); talk('我不要下車！','face_143',TUG); bark(2); }
    }else if(phase==='tug'){
      tugT+=dt; tug=Math.max(0,tug-(.12+.12*tugT/TUG)*dt); shake=Math.max(0,shake-dt);   // 阿布一直往車裡縮
      if(pulled||tugT>=TUG){
        won=pulled; phase='done'; upd();
        if(won){ sfx.win(); bark(2); talk('哼…好啦，下車就下車','face_62',2.5); pop(`+${BONUS} 秒`,'#3E6B25'); }
        else { sfx.bad(); talk('拉不動！我就是不下車','face_66',2.5); }
        setTimeout(finish,1600);
      }
    }
    dist+=speed*dt;
    carY+=(laneY(lane)-carY)*Math.min(1,dt*12);
    ctx.clearRect(0,0,W,H); drawWorld(dt); drawHouse();
    ctx.font='30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const cx=W*.32, half=Math.min(W*.38,laneH()*2.3)/2;
    for(let i=items.length-1;i>=0;i--){
      const it=items[i]; it.x-=(speed+(it.car?it.v:0))*dt*1.1;
      if(it.car) drawOncoming(it); else ctx.fillText(it.e,it.x,laneY(it.lane)+Math.sin(t*4+it.bob)*3);
      const reach=it.car? half+vw(it)*.4 : half;
      if(phase==='drive'&&it.lane===lane&&Math.abs(it.x-cx)<reach){
        if(it.car){ if(hurt>0) continue; items.splice(i,1); left=Math.max(0,left-CRASH); hurt=.9; shake=.4; sfx.bad(); pop(`−${CRASH} 秒`,'#C8452F'); talk(it.k==='bike'? pick(['腳踏車！小心！','差點撞到人']) : it.k==='moto'? pick(['機車好吵！','嚇死我了！']) : pick(['叭叭！','好險…']),'face_143',1.1); if(navigator.vibrate) try{navigator.vibrate(70)}catch(e){} }
        else { items.splice(i,1); left+=it.val; sfx.good(); pop(`+${it.val} 秒`,'#3E6B25'); talk(it.line,it.val>=3?'face_car2':'face_car3',1); }
        ctx.font='30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      }else if(it.x<-120) items.splice(i,1);
    }
    const c=drawCar(dt);
    if(hurt>0&&Math.floor(hurt*10)%2===0){ ctx.fillStyle='rgba(200,69,47,.12)'; ctx.fillRect(0,0,W,H); }
    if(faceT>0){ faceT-=dt; if(faceT<=0&&phase==='drive') faceK= speed>240? 'face_car2':'face_car1'; }
    if(sayT>0){ sayT-=dt; bubble(say,c.hx+c.r*.4,c.hy-c.r); }
    pops=pops.filter(p=>{ p.y+=40*dt; p.v-=dt*.8; ctx.globalAlpha=Math.max(0,p.v); ctx.font='bold 20px "Huninn",sans-serif'; ctx.fillStyle=p.col; ctx.textAlign='center'; ctx.fillText(p.txt,Math.min(W-40,c.x+c.cw*.5+44),c.y-10-p.y); ctx.globalAlpha=1; return p.v>0; });
    if(phase==='drive'){                                              // 剩下的時間
      const full=Math.max(START,left); ctx.fillStyle='rgba(43,39,35,.12)'; ctx.fillRect(12,12,W-24,8); ctx.fillStyle= left<5?'#C8452F':'#D9772B'; ctx.fillRect(12,12,(W-24)*Math.min(1,left/full),8);
      ctx.fillStyle='#2B2723'; ctx.font='bold 13px "Huninn",sans-serif'; ctx.textAlign='right'; ctx.fillText(`剩 ${Math.ceil(left)} 秒`,W-14,34);
    }
    if(phase!=='intro'&&phase!=='tug'){                              // 大大的「在車上 X 秒」，每過一秒跳一下
      const sec=Math.floor(ride), since=ride-sec, pz=phase==='drive'? 1+.18*Math.max(0,1-since*5) : 1, best=S.best.carTime||0;
      ctx.save(); ctx.translate(W/2,H*.16); ctx.scale(pz,pz); ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 13px "Huninn",sans-serif'; ctx.fillStyle='#2B2723'; ctx.fillText('阿布在車上',0,-30);
      ctx.font='bold 46px "Huninn",sans-serif'; ctx.lineWidth=6; ctx.strokeStyle='#2B2723'; ctx.lineJoin='round';
      ctx.strokeText(`${sec} 秒`,0,4); ctx.fillStyle= best&&sec>best? '#F2C230' : '#FFFDF7'; ctx.fillText(`${sec} 秒`,0,4);
      if(best){ ctx.font='12px "Huninn",sans-serif'; ctx.fillStyle='#2B2723'; ctx.fillText(sec>best? '新紀錄！' : `最高 ${best} 秒`,0,34); }
      ctx.restore();
    }
    if(phase==='tug'){                                                // 拉下車：條子拉滿就成功
      const bw=W-48, bx=24, by=H*.2;
      ctx.fillStyle='rgba(255,253,247,.88)'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(12,by-40,W-24,94,16): ctx.rect(12,by-40,W-24,94); ctx.fill();
      ctx.fillStyle='#FFFDF7'; ctx.strokeStyle='#2B2723'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,bw,22,11): ctx.rect(bx,by,bw,22); ctx.fill(); ctx.stroke();
      ctx.fillStyle= tug>.7? '#F2C230':'#EE8597'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx+2,by+2,(bw-4)*tug,18,9): ctx.rect(bx+2,by+2,(bw-4)*tug,18); ctx.fill();
      ctx.font='bold 17px "Huninn",sans-serif'; ctx.fillStyle='#2B2723'; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillText(`連打畫面，把阿布拉下車！ ${Math.max(0,Math.ceil(TUG-tugT))}`,W/2,by-12);
      ctx.font='12px sans-serif'; ctx.textAlign='left'; ctx.fillText('阿布：不要！',bx,by+40); ctx.textAlign='right'; ctx.fillText(`拉下車 +${BONUS} 秒`,bx+bw,by+40);
    }
    if(phase!=='over') raf=requestAnimationFrame(frame);
  }
  function finish(){
    if(phase==='over') return; phase='over'; cancelAnimationFrame(raf);
    const total=Math.floor(ride)+(won?BONUS:0), bones=Math.max(1,Math.min(12,Math.floor(total/10)));   // 每 10 秒換 1 片餅乾
    const best=Math.max(S.best.carTime||0,total), nb=best>(S.best.carTime||0); S.best.carTime=best; save();
    winDialog({title: won?'成功拉下車！':'阿布死賴在車上', text:`阿布在車上待了 ${Math.floor(ride)} 秒${won?`，拉下車再 +${BONUS} 秒`:''}，總共 ${total} 秒${nb?'，新紀錄！':`（最高 ${best} 秒）`}<br>每 10 秒換 1 片餅乾。`, bones, faceKey: won?'face_62':'face_66', again:()=>go('car'),rank:{game:'car',score:total}});
  }
  function intro(){
    ctx.clearRect(0,0,W,H); drawWorld(0); carY=laneY(1); drawCar(0);
    const m=modal(`<img class="face-img" src="${face('face_car1')}" alt=""><h3>阿布最愛坐車了</h3><p>點上、下換車道，閃開來車。<br>到了連打，把阿布拉下車！</p><button class="btn" id="go">出發！</button>`);
    m.el.querySelector('#go').onclick=()=>{ m.el.remove(); ac(); bark(2); phase='drive'; t=0; speed=60; last=performance.now(); talk('出發囉！','face_car1',1.2); raf=requestAnimationFrame(frame); };
  }
  setTimeout(intro,50);
  cleanup=()=>{ phase='over'; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown',onKey); document.querySelectorAll('.overlay').forEach(o=>o.remove()); };
}

/* ================= 小遊戲：陪阿布散步（阿布怕人多、怕鞭炮） =================
 * 左右拖著阿布走。靠近人群、被鞭炮嚇到，阿布「想回家」就越高；越想回家就拉著你走越快、越難閃。
 * 想回家只會累積、不會降；撿草地和餅乾可以多走幾公尺。想回家滿了，阿布就拖著你衝回家——比誰散步走得最遠，每 20 公尺換 1 片餅乾。 */
function Walk(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('陪阿布散步','wstat'));
  const wrap=h(`<div class="catch-wrap walk-wrap"><canvas></canvas></div>`); s.appendChild(wrap);
  s.appendChild(h(`<div class="legend"><span><b>撿起來</b> 🌿 +3公尺　<img class="ico" src="img/biscuit/bear.png" alt=""> +8公尺</span><span class="no"><b class="no">閃開</b> 人群　🧨</span></div>`));
  main.appendChild(s);
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d');
  const F={}; ['face_65','face_60','face_143','face_66','face_62'].forEach(k=>{ const im=new Image(); im.src=face(k); F[k]=im; });
  const bis=new Image(); bis.src=SHAPES[0];
  const R=80, INK='#2B2723', PX_M=30;
  const SKIN=['#F6D7BD','#EBC19E','#D9A57E','#F3CFB3'], HAIR=['#2B2723','#4A3426','#6B4A32','#8C8A86','#1F1B18'];
  const SHIRT=['#E0715A','#7FB3D5','#8DBF7A','#F2C230','#B8A6D9','#EE8597','#FFFDF7','#5C7A9C'], PANTS=['#3E4A5C','#5C6B7A','#8A6242','#2B2723','#6B8FB3'];
  const CHAT=['哈哈哈','欸你看','…','好吵','！','在拍照','排隊中'];
  let W=0,H=0,dpr=1, x=0, tx=0, want=0, freezeT=0, bumpCD=0, walked=0, speed=0, t=0, last=0, raf=0, phase='intro', things=[], spawnT=0, blasts=[], boltT=0, shake=0;
  let faceK='face_65', say='', sayT=0, lastM=0, bump=0, pops=[];
  function size(){ const r=wrap.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); if(!x) x=tx=W/2; }
  size(); const ro=new ResizeObserver(size); ro.observe(wrap);
  const ay=()=>H*.7, ar=()=>Math.max(22,Math.min(30,W*.075));
  const stat=$('#wstat'); stat.textContent='';
  const talk=(txt,ms=1.3)=>{ say=txt; sayT=ms; };
  const setX=e=>{ const r=wrap.getBoundingClientRect(); tx=Math.max(W*.14+ar(),Math.min(W*.86-ar(),e.clientX-r.left)); };
  let holding=false;
  wrap.addEventListener('pointerdown',e=>{ e.preventDefault(); ac(); holding=true; setX(e); try{ wrap.setPointerCapture(e.pointerId); }catch(x){} });
  wrap.addEventListener('pointermove',e=>{ if(holding) setX(e); });
  ['pointerup','pointercancel'].forEach(ev=>wrap.addEventListener(ev,()=>{ holding=false; }));
  const look=()=>({skin:pick(SKIN),hair:pick(HAIR),style:Math.floor(Math.random()*4),shirt:pick(SHIRT),pants:pick(PANTS),bag:Math.random()<.3?pick(['#D9772B','#7FB3D5','#EE8597']):'',phone:Math.random()<.25,ph:Math.random()*6});
  function spawn(){
    const r=Math.random(), m=walked/PX_M;
    if(m>25&&r<Math.min(.2,.08+m/2000)){ things.push({k:'boom',x:W*.2+Math.random()*W*.6,y:-30,fuse:2.4+Math.random()*1.2}); return; }   // 鞭炮：引信燒完就爆
    if(r<.36){                                                   // 一群人
      const n=3+Math.floor(Math.random()*4), cx=W*.2+Math.random()*W*.6;
      const mm=[...Array(n)].map((_,k)=>{ const a=k/n*Math.PI*2+Math.random()*.6, rr=14+Math.random()*16; return Object.assign({dx:Math.cos(a)*rr*1.3,dy:Math.sin(a)*rr*.8},look()); });
      things.push({k:'crowd',x:cx,y:-60,m:mm,vx:0,chat:pick(CHAT),ct:Math.random()*3});
    }else if(r<.66){                                             // 橫過去的路人
      const dir=Math.random()<.5?1:-1;
      things.push({k:'walker',x:dir>0?-20:W+20,y:-20-Math.random()*60,m:[Object.assign({dx:0,dy:0},look())],vx:dir*(35+Math.random()*35)});
    }else things.push({k:Math.random()<.7?'grass':'bis',x:W*.18+Math.random()*W*.64,y:-30});
  }
  /* 路人：正面的小人，安全又可愛（頭髮、衣服、褲子、包包、手機都隨機） */
  function person(px,py,p,walk){
    const sc=Math.max(.85,Math.min(1.15,W/390)), sw=walk? Math.sin(t*9+p.ph)*3*sc : 0;
    ctx.save(); ctx.translate(px,py); ctx.scale(sc,sc);
    ctx.fillStyle='rgba(43,39,35,.16)'; ctx.beginPath(); ctx.ellipse(0,20,11,3.5,0,0,7); ctx.fill();
    ctx.strokeStyle=INK; ctx.lineWidth=1.8; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.fillStyle=p.pants; [[-4,sw],[4,-sw]].forEach(([lx,o])=>{ ctx.beginPath(); ctx.roundRect? ctx.roundRect(lx-2.8,8+Math.min(0,o),5.6,12-Math.abs(o)*.3,2.5): ctx.rect(lx-2.8,8,5.6,12); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle=p.shirt; ctx.beginPath(); ctx.roundRect? ctx.roundRect(-8.5,-7,17,17,6): ctx.rect(-8.5,-7,17,17); ctx.fill(); ctx.stroke();
    ctx.fillStyle=p.skin; [[-10,-sw],[10,sw]].forEach(([hx,o])=>{ ctx.beginPath(); ctx.arc(hx,5+o*.4,2.6,0,7); ctx.fill(); ctx.stroke(); });
    if(p.bag){ ctx.fillStyle=p.bag; ctx.beginPath(); ctx.roundRect? ctx.roundRect(6,1,8,8,2): ctx.rect(6,1,8,8); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(9,2); ctx.stroke(); }
    if(p.phone){ ctx.fillStyle='#3E4A5C'; ctx.fillRect(-12.5,-1,5,7); }
    ctx.fillStyle=p.skin; ctx.beginPath(); ctx.arc(0,-15,9,0,7); ctx.fill(); ctx.stroke();                     // 臉
    ctx.fillStyle=p.hair;
    if(p.style===3){ ctx.fillStyle=p.shirt; ctx.beginPath(); ctx.arc(0,-16,9.4,Math.PI*1.05,Math.PI*1.95); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillRect(-2,-19,13,3); }   // 帽子
    else { ctx.beginPath(); ctx.arc(0,-16,9.4,Math.PI*1.02,Math.PI*1.98); ctx.quadraticCurveTo(3,-18,-9,-15); ctx.fill();
      if(p.style===1){ ctx.fillRect(-9.5,-16,3.5,12); ctx.fillRect(6,-16,3.5,12); }                           // 長髮
      if(p.style===2){ ctx.beginPath(); ctx.arc(0,-26,4,0,7); ctx.fill(); } }                                  // 丸子頭
    ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(-3.2,-14,1.1,0,7); ctx.arc(3.2,-14,1.1,0,7); ctx.fill();
    ctx.strokeStyle='rgba(43,39,35,.6)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(0,-11.5,2,.2,Math.PI-.2); ctx.stroke();
    ctx.restore();
  }
  /* 背景：兩側草地、樹、花、路燈、長椅，中間石板步道 */
  const side=[...Array(12)].map((_,k)=>({y:k*95,l:k%2===0,kind:['tree','flower','tree','lamp','bench','tree'][k%6],c:pick(['#EE8597','#F2C230','#FFFDF7','#B8A6D9'])}));
  function tree(tx2,ty,r){ ctx.fillStyle='rgba(43,39,35,.12)'; ctx.beginPath(); ctx.ellipse(tx2+4,ty+r*.8,r*.9,r*.35,0,0,7); ctx.fill();
    ctx.fillStyle='#8A6242'; ctx.fillRect(tx2-3,ty,6,r*.8); ctx.fillStyle='#6FA35A'; ctx.beginPath(); ctx.arc(tx2,ty-r*.2,r,0,7); ctx.fill();
    ctx.fillStyle='#84B96D'; ctx.beginPath(); ctx.arc(tx2-r*.3,ty-r*.45,r*.55,0,7); ctx.fill(); }
  function drawScene(){
    ctx.fillStyle='#CFE3B8'; ctx.fillRect(0,0,W,H);
    const pl=W*.14, pr=W*.86, off=walked%40;
    ctx.fillStyle='#EFE3C8'; ctx.fillRect(pl,0,pr-pl,H);
    ctx.strokeStyle='rgba(180,150,105,.35)'; ctx.lineWidth=1.5;                                      // 石板紋路
    for(let y=-40+off;y<H+40;y+=40){ ctx.beginPath(); ctx.moveTo(pl,y); ctx.lineTo(pr,y); ctx.stroke(); const s2=(Math.round((y-off)/40)%2)*30; for(let xx=pl+30+s2;xx<pr;xx+=60){ ctx.beginPath(); ctx.moveTo(xx,y); ctx.lineTo(xx,y+40); ctx.stroke(); } }
    ctx.fillStyle='#D9C49A'; ctx.fillRect(pl-4,0,4,H); ctx.fillRect(pr,0,4,H);
    ctx.fillStyle='#B7D39E'; for(let k=0;k<26;k++){ const gy=((k*47+walked)%(H+60))-30, gx=(k%2? pr+8+(k*13)%(W-pr-14) : 6+(k*17)%(pl-14)); ctx.fillRect(gx,gy,2,6); ctx.fillRect(gx+4,gy+2,2,5); }
    const span=12*95;
    side.forEach(d=>{
      const yy=((d.y+walked)%span+span)%span-60, sx=d.l? pl/2 : (pr+W)/2;
      if(d.kind==='tree') tree(sx,yy,Math.min(22,pl*.42));
      else if(d.kind==='flower'){ [[-8,0],[6,-6],[2,8]].forEach(([fx,fy])=>{ ctx.fillStyle=d.c; ctx.beginPath(); ctx.arc(sx+fx,yy+fy,4,0,7); ctx.fill(); ctx.fillStyle='#F2C230'; ctx.beginPath(); ctx.arc(sx+fx,yy+fy,1.5,0,7); ctx.fill(); }); }
      else if(d.kind==='lamp'){ ctx.fillStyle='#5C6B7A'; ctx.fillRect(sx-2,yy-26,4,30); ctx.fillStyle='#FFF3B0'; ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(sx,yy-28,6,0,7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle='#A57A52'; ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.fillRect(sx-9,yy-16,18,32); ctx.strokeRect(sx-9,yy-16,18,32); ctx.fillStyle='#8A6242'; ctx.fillRect(sx-9,yy-16,5,32); }
    });
  }
  function drawBoom(o){                                        // 鞭炮：紅色一串，引信冒火花，快爆時閃
    const blink=o.fuse<1&&Math.floor(o.fuse*8)%2===0;
    ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(-.3);
    ctx.fillStyle='rgba(43,39,35,.15)'; ctx.beginPath(); ctx.ellipse(2,12,16,4,0,0,7); ctx.fill();
    ctx.strokeStyle=INK; ctx.lineWidth=1.8;
    for(let k=0;k<3;k++){ ctx.fillStyle=blink?'#FF8A65':'#D84332'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(-12+k*8,-10,7,20,2): ctx.rect(-12+k*8,-10,7,20); ctx.fill(); ctx.stroke(); ctx.fillStyle='#F2C230'; ctx.fillRect(-12+k*8,-2,7,3); }
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.quadraticCurveTo(4,-18,1,-22); ctx.stroke();
    for(let k=0;k<4;k++){ ctx.fillStyle=pick(['#F2C230','#FF8A65','#FFF3B0']); ctx.beginPath(); ctx.arc(1+(Math.random()-.5)*10,-23+(Math.random()-.5)*10,1.6,0,7); ctx.fill(); }
    ctx.restore();
    if(o.fuse<1.2){ ctx.strokeStyle='rgba(216,67,50,.35)'; ctx.setLineDash([5,5]); ctx.lineWidth=2; ctx.beginPath(); ctx.arc(o.x,o.y,85,0,7); ctx.stroke(); ctx.setLineDash([]); }
  }
  /* 阿布的背影：從真實照片去背，捲尾巴會搖（預先做好 9 格搖尾巴的圖） */
  const WALK=new Image(); WALK.src='img/abu_walk.webp'; const LEG=new Image(); LEG.src='img/abu_leg.webp';
  const FW=107, FH=240, NF=9, COLLAR=[76,69], HEADTOP=[90,18], LW=23, LH=59, LEGL=[42.9,178.4], LEGR=[71.6,174.6];   // 兩隻後腳：照片裡原本的左後腳，右後腳用它左右翻過來
  function drawAbu(){
    const hgt=Math.max(110,Math.min(150,H*.25)), sc=hgt/FH, fw=FW*sc, run=speed/60;
    const wagHz= freezeT>0? 2 : want>.6? 16 : 9, wagAmp= freezeT>0? .25 : want>.6? 1 : .8;
    const fr=Math.max(0,Math.min(NF-1,Math.round((Math.sin(t*wagHz)*wagAmp+1)/2*(NF-1))));
    const step=walked/(10-Math.min(5,run)), bob=freezeT>0? 0 : Math.abs(Math.sin(step))*3.5;
    const sway=freezeT>0? (Math.random()-.5)*.05 : Math.sin(step)*.035;
    const ax=x, fy=ay()+hgt*.42-(bump>0? Math.sin(bump*Math.PI)*14:0);          // 腳的位置
    const cxp=ax-fw/2+COLLAR[0]*sc, cyp=fy-hgt+COLLAR[1]*sc-bob;
    const taut=want>.6;                                          // 牽繩：紅黑編織繩，越想回家拉得越直
    ctx.strokeStyle='#B8322A'; ctx.lineWidth=3; ctx.setLineDash([5,3]); ctx.beginPath(); ctx.moveTo(cxp,cyp); taut? ctx.lineTo(W/2,H+10) : ctx.quadraticCurveTo((cxp+W/2)/2,H-10,W/2,H+10); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(43,39,35,.18)'; ctx.beginPath(); ctx.ellipse(ax,fy,fw*.45,hgt*.05,0,0,7); ctx.fill();
    ctx.save(); ctx.translate(ax,fy-bob); ctx.rotate(sway);
    if(LEG.complete&&LEG.naturalWidth){                         // 後腳一前一後踏（畫在身體後面）
      const lift=freezeT>0? 0 : Math.sin(step)*5*sc*2, ox=-fw/2, oy=-hgt;
      ctx.drawImage(LEG,ox+LEGL[0]*sc,oy+LEGL[1]*sc-Math.max(0,lift),LW*sc,LH*sc);
      ctx.save(); ctx.translate(ox+(LEGR[0]+LW)*sc,oy+LEGR[1]*sc-Math.max(0,-lift)); ctx.scale(-1,1); ctx.drawImage(LEG,0,0,LW*sc,LH*sc); ctx.restore();
    }
    if(WALK.complete&&WALK.naturalWidth) ctx.drawImage(WALK,fr*FW,0,FW,FH,-fw/2,-hgt,fw,hgt);
    ctx.restore();
    const hx=ax-fw/2+HEADTOP[0]*sc, hy=fy-hgt+HEADTOP[1]*sc-bob;
    if(want>.6){ ctx.fillStyle='#7FB3D5'; ctx.beginPath(); ctx.ellipse(hx+14,hy+10+Math.sin(t*6)*2,3,5,0,0,7); ctx.fill(); }   // 冒冷汗
    if(run>2.4){ ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2.5; for(let k=0;k<3;k++){ const lx=ax-fw*.3+k*fw*.3; ctx.beginPath(); ctx.moveTo(lx,fy+6); ctx.lineTo(lx,fy+16+run*3); ctx.stroke(); } }
    return {ax:hx,y:hy+18,r:18};
  }
  function hud(){
    const m=Math.floor(walked/PX_M), best=S.best.walkM||0, pz=1+.16*Math.max(0,1-(t-lastM)*4);
    ctx.save(); ctx.translate(W/2,H*.1); ctx.scale(pz,pz); ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 13px "Huninn",sans-serif'; ctx.fillStyle=INK; ctx.fillText('散步',0,-28);
    ctx.font='bold 44px "Huninn",sans-serif'; ctx.lineWidth=6; ctx.strokeStyle=INK; ctx.lineJoin='round';
    ctx.strokeText(`${m} 公尺`,0,4); ctx.fillStyle= best&&m>best? '#F2C230' : '#FFFDF7'; ctx.fillText(`${m} 公尺`,0,4);
    if(best){ ctx.font='12px "Huninn",sans-serif'; ctx.fillStyle=INK; ctx.fillText(m>best?'新紀錄！':`最高 ${best} 公尺`,0,32); }
    ctx.restore();
    const bx=34, bw=W-bx-40, by=H*.1+54;                               // 想回家：阿布的頭一路往小房子靠近，碰到就衝回家
    ctx.fillStyle='rgba(255,253,247,.9)'; ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,bw,14,7): ctx.rect(bx,by,bw,14); ctx.fill(); ctx.stroke();
    const g=ctx.createLinearGradient(bx,0,bx+bw,0); g.addColorStop(0,'#7FB36A'); g.addColorStop(.55,'#E3B341'); g.addColorStop(1,'#C8452F');
    ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx+2,by+2,Math.max(0,(bw-4)*want),10,5): ctx.rect(bx+2,by+2,(bw-4)*want,10); ctx.fill();
    ctx.font='bold 12px "Huninn",sans-serif'; ctx.fillStyle=INK; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('阿布想回家',bx,by-11);
    ctx.font='20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='left'; ctx.fillText('🏠',bx+bw+4,by+6);
    const fx=bx+(bw-4)*want, im=F['face_65'], rr=10+(want>.7?Math.sin(t*20)*1.5:0);
    ctx.save(); ctx.beginPath(); ctx.arc(fx,by+7,rr+2,0,7); ctx.fillStyle=want>.7?'#EE8597':'#F2C230'; ctx.fill(); ctx.beginPath(); ctx.arc(fx,by+7,rr,0,7); ctx.clip(); if(im.complete) ctx.drawImage(im,fx-rr,by+7-rr,rr*2,rr*2); ctx.restore();
  }
  function frame(ts){
    const dt=Math.min(.05,(ts-last)/1000||0); last=ts; t+=dt;
    freezeT=Math.max(0,freezeT-dt); bumpCD=Math.max(0,bumpCD-dt); bump=Math.max(0,bump-dt*2.5); shake=Math.max(0,shake-dt);
    if(phase==='walk'||phase==='bolt'){
      const m0=walked/PX_M;
      speed= phase==='bolt'? 420 : freezeT>0? 0 : 80+Math.min(70,m0*.5)+want*190;            // 越想回家走越快
      walked+=speed*dt; if(Math.floor(walked/PX_M/10)>Math.floor(m0/10)) lastM=t;
      if(phase==='walk'){
        spawnT-=dt*(speed/90); if(spawnT<=0){ spawn(); spawnT=Math.max(.55,1.25-m0/400); }
        x+=(tx-x)*Math.min(1,dt*8);
        let near=0, touch=false;
        things.forEach(o=>{ o.y+=speed*dt; o.x+=(o.vx||0)*dt; if(o.m) o.m.forEach(p=>{ const d=Math.hypot(o.x+p.dx-x,o.y+p.dy-ay()); if(d<R) near+=(1-d/R); if(d<ar()+8) touch=true; }); });
        if(near>0) want=Math.min(1,want+near*.16*dt);                // 想回家只會越來越高，不會降
        want=Math.min(1,want+.006*dt);                               // 走久了本來就會慢慢想回家
        if(touch&&!bumpCD){ freezeT=1; bumpCD=1.8; want=Math.min(1,want+.1); bump=1; talk(pick(['（嚇到定住）','不要碰我！','人好多…']),1.1); sfx.bad(); }
        for(let i=things.length-1;i>=0;i--){
          const o=things[i];
          if(o.k==='boom'){ o.fuse-=dt; if(o.fuse<=0){
            things.splice(i,1); blasts.push({x:o.x,y:o.y,v:0}); shake=.5; tone(90,.4,'sawtooth',.18,-50); tone(1400,.15,'square',.06,-900);
            if(Math.hypot(o.x-x,o.y-ay())<85){ want=Math.min(1,want+.3); freezeT=.8; bump=1; talk('砰！！我要回家！',1.4); if(navigator.vibrate) try{navigator.vibrate(120)}catch(e){} }
            continue; } }
          if((o.k==='grass'||o.k==='bis')&&Math.hypot(o.x-x,o.y-ay())<ar()+16){
            things.splice(i,1); const add=o.k==='bis'?8:3; walked+=add*PX_M; pops.push({txt:`+${add} 公尺`,v:1,y:0}); sfx.good(); faceK='face_60'; talk(o.k==='bis'?'餅乾！':'草地好香',1); continue;
          }
          if(o.y>H+80||o.x<-60||o.x>W+60) things.splice(i,1);
        }
        faceK= freezeT>0||want>.7? 'face_143' : (faceK==='face_60'&&sayT>0)? 'face_60' : want>.4? 'face_65':'face_66';
        if(want>.7&&sayT<=0&&Math.random()<dt) talk(pick(['我要回家','快走快走','這裡好可怕']),1.1);
        if(want>=1){ phase='bolt'; boltT=1.6; talk('我要回家！！',1.6); bark(3); }
      }else{
        things.forEach(o=>{ o.y+=speed*dt; }); boltT-=dt; if(boltT<=0){ phase='end'; finish(); }
      }
    }
    ctx.save(); if(shake>0) ctx.translate((Math.random()-.5)*shake*16,(Math.random()-.5)*shake*16);
    drawScene();
    things.forEach(o=>{
      if(!o.m) return;
      const rr=o.k==='crowd'? R*.95 : R*.6, g=ctx.createRadialGradient(o.x,o.y,rr*.2,o.x,o.y,rr);
      g.addColorStop(0,'rgba(238,133,151,.34)'); g.addColorStop(1,'rgba(238,133,151,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(o.x,o.y,rr,0,7); ctx.fill();
    });
    ctx.font='24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    things.forEach(o=>{ if(o.k==='grass') ctx.fillText('🌿',o.x,o.y); else if(o.k==='bis'&&bis.complete) ctx.drawImage(bis,o.x-15,o.y-15,30,30); else if(o.k==='boom') drawBoom(o); });
    const ppl=[]; things.forEach(o=>{ if(o.m) o.m.forEach(p=>ppl.push([o.x+p.dx,o.y+p.dy,p,o.k==='walker'])); });
    ppl.sort((a,b)=>a[1]-b[1]).forEach(([px,py,p,wk])=>person(px,py,p,wk));
    things.forEach(o=>{
      if(o.k!=='crowd') return; o.ct+=1/60; if(Math.sin(o.ct*1.4)<.2) return;
      ctx.font='12px "Huninn",sans-serif'; const tw=ctx.measureText(o.chat).width+14, bx=o.x-tw/2, by=o.y-58;
      ctx.fillStyle='#FFFDF7'; ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,tw,20,8): ctx.rect(bx,by,tw,20); ctx.fill(); ctx.stroke();
      ctx.fillStyle=INK; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(o.chat,o.x,by+10);
    });
    blasts=blasts.filter(b=>{ b.v+=dt*2.2; const rr=20+b.v*80; ctx.globalAlpha=Math.max(0,1-b.v);
      ctx.fillStyle='#FFF3B0'; ctx.beginPath(); ctx.arc(b.x,b.y,rr,0,7); ctx.fill(); ctx.strokeStyle='#D84332'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(b.x,b.y,rr*.8,0,7); ctx.stroke();
      ctx.fillStyle='#D84332'; ctx.font='bold 26px "Huninn",sans-serif'; ctx.textAlign='center'; ctx.fillText('砰！',b.x,b.y-rr*.3); ctx.globalAlpha=1; return b.v<1; });
    const a=drawAbu();
    ctx.restore();
    if(sayT>0){ sayT-=dt; ctx.font='15px "Huninn",sans-serif'; const tw=ctx.measureText(say).width+20, bx=Math.max(8,Math.min(W-tw-8,a.ax-tw/2)), by=a.y-a.r-44;
      ctx.fillStyle='#FFFDF7'; ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,tw,30,12): ctx.rect(bx,by,tw,30); ctx.fill(); ctx.stroke(); ctx.fillStyle=INK; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(say,bx+10,by+15); }
    pops=pops.filter(p=>{ p.y+=40*(1/60); p.v-=1/60*.9; ctx.globalAlpha=Math.max(0,p.v); ctx.font='bold 18px "Huninn",sans-serif'; ctx.fillStyle='#3E6B25'; ctx.textAlign='center'; ctx.fillText(p.txt,a.ax+46,a.y-20-p.y); ctx.globalAlpha=1; return p.v>0; });
    if(phase!=='intro') hud();
    if(phase!=='over') raf=requestAnimationFrame(frame);
  }
  function finish(){
    phase='over'; cancelAnimationFrame(raf);
    const m=Math.floor(walked/PX_M), bones=Math.max(1,Math.min(12,Math.floor(m/20)));      // 每 20 公尺換 1 片餅乾
    const best=Math.max(S.best.walkM||0,m), nb=best>(S.best.walkM||0); S.best.walkM=best; save();
    if(m>=20) careAbu('walk');                                  // 真的出門走過，就算尿過了
    winDialog({title:'阿布拖著你衝回家了！', text:`今天散步了 ${m} 公尺${nb?'，新紀錄！':`（最高 ${best} 公尺）`}<br>每 20 公尺換 1 片餅乾。`, bones, faceKey:'face_62', again:()=>go('walk'),rank:{game:'walk',score:m}});
  }
  function intro(){
    const m=modal(`<img class="face-img" src="${face('face_143')}" alt=""><h3>阿布怕人多</h3><p>左右拖，閃開人群和鞭炮。<br>阿布越想回家，就走得越快！</p><button class="btn" id="go">出門散步</button>`);
    m.el.querySelector('#go').onclick=()=>{ m.el.remove(); ac(); bark(1); phase='walk'; t=0; talk('慢慢走就好',1.4); };
  }
  last=performance.now(); raf=requestAnimationFrame(frame); setTimeout(intro,50);
  cleanup=()=>{ phase='over'; cancelAnimationFrame(raf); ro.disconnect(); document.querySelectorAll('.overlay').forEach(o=>o.remove()); };
}

/* ================= 小遊戲：阿布下樓梯 =================
 * 台階一直往上升，阿布往下跳。按住左邊／右邊移動，別被天花板的刺刺到，也別掉出畫面。
 * 一般台階回 1 格血；紅色刺刺台扣血；軟墊會彈起來；跑步機會把阿布帶著走；紙箱站一下就垮。比誰下到最深的樓層。 */
function Stairs(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('阿布下樓梯','sstat'));
  const wrap=h(`<div class="catch-wrap stairs-wrap"><canvas></canvas></div>`); s.appendChild(wrap);
  s.appendChild(h(`<div class="legend"><span>手指左右滑，阿布跟著走；按住左邊、右邊也可以</span></div>`));
  main.appendChild(s);
  const cv=wrap.querySelector('canvas'), ctx=cv.getContext('2d'), INK='#2B2723';
  const F={}; ['face_stairs','face_60','face_143','face_66','face_62'].forEach(k=>{ const im=new Image(); im.src=face(k); F[k]=im; });
  const MAXHP=10, GAP=78;
  let W=0,H=0,dpr=1, plats=[], ax=0, ay=0, vx=0, vy=0, on=null, onT=0, hp=MAXHP, scroll=0, floors=0, speed=70, t=0, last=0, raf=0, phase='intro', dir=0, inv=0, flash=0, nextY=0;
  let faceK='face_stairs', faceT=0, say='', sayT=0;
  const R=()=>Math.max(15,Math.min(20,W*.048));
  function size(){ const r=wrap.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); W=r.width; H=r.height; cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  size(); const ro=new ResizeObserver(size); ro.observe(wrap);
  const stat=$('#sstat'); stat.textContent='';
  const talk=(txt,k,ms=1)=>{ say=txt; sayT=ms; if(k){ faceK=k; faceT=ms; } };
  /* 按住左半邊往左、右半邊往右 */
  /* 兩種操作都可以：手指左右滑＝阿布跟著手指移動（最準）；按住不動＝往那一邊一直走 */
  const pts=new Map();
  const upd=()=>{ let d=0; pts.forEach(p=>{ if(!p.drag) d+= p.x<W/2? -1 : 1; }); dir=Math.max(-1,Math.min(1,d)); };
  wrap.addEventListener('pointerdown',e=>{ e.preventDefault(); ac(); const r=wrap.getBoundingClientRect(), x=e.clientX-r.left; pts.set(e.pointerId,{x,x0:x,last:x,drag:false}); try{ wrap.setPointerCapture(e.pointerId); }catch(x){} upd(); });
  wrap.addEventListener('pointermove',e=>{
    const p=pts.get(e.pointerId); if(!p) return; const r=wrap.getBoundingClientRect(), x=e.clientX-r.left;
    if(!p.drag&&Math.abs(x-p.x0)>6) p.drag=true;
    if(p.drag&&phase==='play'){ ax=Math.max(R(),Math.min(W-R(),ax+(x-p.last)*1.4)); }
    p.last=x; p.x=x; upd();
  });
  ['pointerup','pointercancel'].forEach(ev=>wrap.addEventListener(ev,e=>{ pts.delete(e.pointerId); upd(); }));
  const keys={}; const onKey=e=>{ const v=e.type==='keydown'; if(e.key==='ArrowLeft') keys.l=v; if(e.key==='ArrowRight') keys.r=v; };
  window.addEventListener('keydown',onKey); window.addEventListener('keyup',onKey);
  function kindFor(){
    const f=floors, r=Math.random();
    if(f<3) return 'normal';
    if(r<Math.min(.22,.1+f/300)) return 'spike';
    if(r<.36) return 'spring';
    if(r<.5) return Math.random()<.5? 'convL':'convR';
    if(r<Math.min(.64,.56+f/800)) return 'box';
    return 'normal';
  }
  function addPlat(y,kind){ const w=Math.max(78,Math.min(112,W*.27)); plats.push({x:Math.max(8,Math.min(W-w-8,Math.random()*(W-w))),y,w,kind:kind||kindFor(),broken:0,used:false}); }
  function reset(){
    plats=[]; hp=MAXHP; floors=0; scroll=0; speed=70; t=0; inv=0; vx=vy=0; on=null;
    let y=H*.35; for(;y<H+GAP;y+=GAP) addPlat(y,'normal'); nextY=y;
    const p=plats[1]||plats[0]; p.x=W/2-p.w/2; ax=W/2; ay=p.y-R(); on=p;
  }
  /* 台階外觀：一般＝磨石子台階（跟家裡的樓梯一樣）、刺刺台、軟墊、跑步機、紙箱 */
  function drawPlat(p){
    const x=p.x, y=p.y, w=p.w, hgt=14;
    if(p.kind==='box'&&p.broken>0){ ctx.globalAlpha=Math.max(0,1-p.broken*2); }
    ctx.lineWidth=2; ctx.strokeStyle=INK;
    if(p.kind==='normal'){
      ctx.fillStyle='#E8B7A8'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,w,hgt,4): ctx.rect(x,y,w,hgt); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#B8322A'; for(let k=0;k<10;k++){ ctx.fillRect(x+6+((k*37)%(w-12)),y+3+((k*13)%8),2,2); }
      ctx.fillStyle='#FFFDF7'; for(let k=0;k<8;k++){ ctx.fillRect(x+4+((k*23+9)%(w-10)),y+2+((k*7)%9),2,2); }
      ctx.fillStyle='#8A6242'; ctx.fillRect(x,y,w,3);                                   // 台階邊的金屬條
    }else if(p.kind==='spike'){
      ctx.fillStyle='#8C8A86'; ctx.fillRect(x,y+6,w,hgt-6); ctx.strokeRect(x,y+6,w,hgt-6);
      ctx.fillStyle='#D84332'; ctx.beginPath(); for(let k=0;k<w-4;k+=10){ ctx.moveTo(x+2+k,y+6); ctx.lineTo(x+7+k,y-6); ctx.lineTo(x+12+k,y+6); } ctx.fill(); ctx.stroke();
    }else if(p.kind==='spring'){
      ctx.fillStyle='#8DBF7A'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y-2,w,hgt+2,8): ctx.rect(x,y-2,w,hgt+2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#FFFDF7'; ctx.lineWidth=2; ctx.beginPath(); for(let k=12;k<w-8;k+=14){ ctx.moveTo(x+k,y+2); ctx.lineTo(x+k+6,y+9); } ctx.stroke();
    }else if(p.kind==='convL'||p.kind==='convR'){
      ctx.fillStyle='#5C6B7A'; ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,w,hgt,7): ctx.rect(x,y,w,hgt); ctx.fill(); ctx.stroke();
      const off=(t*60*(p.kind==='convL'?-1:1))%14; ctx.strokeStyle='#F2C230'; ctx.lineWidth=2.5; ctx.beginPath();
      for(let k=-14;k<w+14;k+=14){ const xx=x+k+off; if(xx<x+4||xx>x+w-8) continue; const d=p.kind==='convL'?-1:1; ctx.moveTo(xx,y+3); ctx.lineTo(xx+4*d,y+7); ctx.lineTo(xx,y+11); } ctx.stroke();
    }else{
      ctx.fillStyle='#C9A26B'; ctx.fillRect(x,y-4,w,hgt+4); ctx.strokeRect(x,y-4,w,hgt+4);
      ctx.strokeStyle='#8A6242'; ctx.beginPath(); ctx.moveTo(x+w/2,y-4); ctx.lineTo(x+w/2,y+hgt); ctx.stroke();
      ctx.fillStyle='#8A6242'; ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('紙箱',x+w*.25,y+3);
    }
    ctx.globalAlpha=1;
  }
  function drawAbu(){
    const r=R(), blink=inv>0&&Math.floor(inv*12)%2===0;
    if(blink) ctx.globalAlpha=.45;
    const leg=on? 0 : Math.sin(t*20)*3;
    ctx.fillStyle='#D9772B'; ctx.strokeStyle=INK; ctx.lineWidth=2;
    [[-.5,leg],[.5,-leg]].forEach(([sx,o])=>{ ctx.beginPath(); ctx.ellipse(ax+sx*r,ay+r*.9+o,r*.22,r*.3,0,0,7); ctx.fill(); ctx.stroke(); ctx.fillStyle='#FBEBD6'; ctx.beginPath(); ctx.ellipse(ax+sx*r,ay+r*1.12+o,r*.2,r*.12,0,0,7); ctx.fill(); ctx.stroke(); ctx.fillStyle='#D9772B'; });
    ctx.save(); ctx.beginPath(); ctx.arc(ax,ay,r+3,0,7); ctx.fillStyle= hp<=3? '#EE8597':'#F2C230'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(ax,ay,r,0,7); ctx.clip();
    const im=F[faceK]; if(im&&im.complete) ctx.drawImage(im,ax-r,ay-r,r*2,r*2); ctx.restore();
    ctx.globalAlpha=1;
  }
  function hurt(n,line){ if(inv>0) return; hp=Math.max(0,hp-n); inv=.9; flash=.3; sfx.bad(); talk(line,'face_143',1.1); if(navigator.vibrate) try{navigator.vibrate(60)}catch(e){} }
  function frame(ts){
    const dt=Math.min(.033,(ts-last)/1000||0); last=ts;
    if(phase==='play'){
      t+=dt; inv=Math.max(0,inv-dt); flash=Math.max(0,flash-dt);
      speed=Math.min(190,70+floors*1.4);
      const dy=speed*dt; scroll+=dy; plats.forEach(p=>p.y-=dy); nextY-=dy;
      while(nextY<H+GAP){ addPlat(nextY); nextY+=GAP; }
      plats=plats.filter(p=>p.y>-30&&p.broken<.5);
      const nf=Math.floor(scroll/GAP); if(nf>floors){ floors=nf; if(floors%10===0){ tone(880,.12,'triangle',.1,300); talk(`地下 ${floors} 樓了！`,'face_66',1.1); } }
      const d=dir||(keys.l?-1:0)+(keys.r?1:0), r=R();
      vx=d*260;
      if(on){
        if(!plats.includes(on)||on.broken>0.05){ on=null; }
        else{
          ay=on.y-r*1.15; onT+=dt;
          if(on.kind==='convL') vx-=85; if(on.kind==='convR') vx+=85;
          if(on.kind==='box'&&onT>.35&&!on.broken){ on.broken=.01; talk('箱子垮了！','face_143',.8); tone(160,.2,'square',.06,-60); }
          if(ax<on.x-r*.5||ax>on.x+on.w+r*.5){ on=null; vy=0; }
        }
      }
      plats.forEach(p=>{ if(p.broken>0) p.broken+=dt; });
      ax=Math.max(r,Math.min(W-r,ax+vx*dt));
      if(!on){
        vy=Math.min(520,vy+1000*dt); const prev=ay; ay+=vy*dt;
        for(const p of plats){
          const top=p.y-r*1.15;
          if(vy>=0&&prev<=top+3&&ay>=top&&ax>p.x-r*.6&&ax<p.x+p.w+r*.6&&!(p.kind==='box'&&p.broken)){
            ay=top; vy=0; on=p; onT=0;
            if(p.kind==='spike'){ hurt(4,'好痛！'); }
            else if(p.kind==='spring'){ on=null; vy=-480; talk('咻～','face_66',.7); tone(420,.15,'sine',.1,500); }
            else { if(!p.used&&hp<MAXHP){ hp++; } if(p.kind==='convL'||p.kind==='convR') talk('欸欸欸','face_60',.7); else if(Math.random()<.15) talk(pick(['好穩','汪！','下一階']),'face_stairs',.7); }
            p.used=true; break;
          }
        }
      }
      if(ay-r<34){ hurt(5,'頭頂好刺！'); on=null; vy=160; ay=34+r; }         // 天花板的刺
      if(ay>H+r*2){ hp=0; talk('掉下去了…','face_143',1); }
      if(faceT>0){ faceT-=dt; if(faceT<=0) faceK= hp<=3? 'face_62':'face_stairs'; }
      if(hp<=0){ phase='over'; setTimeout(finish,700); }
    }
    /* 畫面 */
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#F4E9D8'); g.addColorStop(1,'#E9D9C0'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(138,98,66,.12)'; ctx.lineWidth=2; for(let k=0;k<12;k++){ const yy=((k*70-scroll*.5)%840+840)%840-40; ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(W,yy+30); ctx.stroke(); }   // 牆上的扶手影子
    plats.forEach(drawPlat);
    if(phase!=='intro') drawAbu();
    ctx.fillStyle='#5C6B7A'; ctx.fillRect(0,0,W,16); ctx.fillStyle='#8C8A86'; ctx.strokeStyle=INK; ctx.lineWidth=1.5;   // 天花板的刺
    ctx.beginPath(); for(let x=0;x<W;x+=14){ ctx.moveTo(x,16); ctx.lineTo(x+7,32); ctx.lineTo(x+14,16); } ctx.fill(); ctx.stroke();
    if(flash>0){ ctx.fillStyle=`rgba(216,67,50,${flash})`; ctx.fillRect(0,0,W,H); }
    if(sayT>0&&phase!=='intro'){ sayT-=1/60; ctx.font='14px "Huninn",sans-serif'; const tw=ctx.measureText(say).width+18, bx=Math.max(6,Math.min(W-tw-6,ax-tw/2)), by=Math.max(40,ay-R()-40);
      ctx.fillStyle='#FFFDF7'; ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect? ctx.roundRect(bx,by,tw,26,10): ctx.rect(bx,by,tw,26); ctx.fill(); ctx.stroke(); ctx.fillStyle=INK; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(say,bx+9,by+13); }
    if(phase!=='intro'){                                              // 大字樓層＋血條
      const best=S.best.stairs||0;
      ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold 36px "Huninn",sans-serif'; ctx.lineWidth=6; ctx.strokeStyle=INK; ctx.lineJoin='round';
      const txt=`地下 ${floors} 樓`; ctx.strokeText(txt,W/2,62); ctx.fillStyle= best&&floors>best? '#F2C230':'#FFFDF7'; ctx.fillText(txt,W/2,62);
      if(best){ ctx.font='12px "Huninn",sans-serif'; ctx.fillStyle=INK; ctx.fillText(floors>best?'新紀錄！':`最高 地下 ${best} 樓`,W/2,88); }
      ctx.restore();
      const bw=Math.min(180,W*.46), bx=W-bw-12, by=H-20;
      for(let k=0;k<MAXHP;k++){ ctx.fillStyle= k<hp? (hp<=3?'#D84332':'#8DBF7A') : 'rgba(43,39,35,.15)'; ctx.fillRect(bx+k*bw/MAXHP+1,by,bw/MAXHP-2,9); }
      ctx.fillStyle=INK; ctx.font='bold 11px "Huninn",sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillText('體力',bx-6,by+5);
    }
    if(phase!=='done') raf=requestAnimationFrame(frame);
  }
  function finish(){
    phase='done'; cancelAnimationFrame(raf);
    const bones=Math.max(1,Math.min(12,Math.floor(floors/5)));      // 每 5 樓換 1 片餅乾
    const best=Math.max(S.best.stairs||0,floors), nb=best>(S.best.stairs||0); S.best.stairs=best; save();
    winDialog({title:`下到地下 ${floors} 樓`, text:`${nb?'新紀錄！':`最高 地下 ${best} 樓`}<br>每 5 樓換 1 片餅乾。`, bones, faceKey:'face_stairs', again:()=>go('stairs'), rank:{game:'stairs',score:floors}});
  }
  function intro(){
    const m=modal(`<img class="face-img" src="${face('face_stairs')}" alt=""><h3>阿布下樓梯</h3><p>手指左右滑，阿布跟著走。<br>別被天花板刺到，也別掉下去！</p><button class="btn" id="go">開始</button>`);
    m.el.querySelector('#go').onclick=()=>{ m.el.remove(); ac(); bark(1); reset(); phase='play'; last=performance.now(); talk('我下樓囉！','face_66',1); };
  }
  reset(); last=performance.now(); raf=requestAnimationFrame(frame); setTimeout(intro,50);
  cleanup=()=>{ phase='done'; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown',onKey); window.removeEventListener('keyup',onKey); document.querySelectorAll('.overlay').forEach(o=>o.remove()); };
}

/* ================= 小遊戲：阿布能不能吃？ ================= */
const FOODS = [
  {e:'🍎',n:'蘋果',ok:1,why:'可以，但要去籽、去果核，切小塊。'},
  {e:'🥕',n:'紅蘿蔔',ok:1,why:'可以，生的熟的都行，切小塊比較好咬。'},
  {e:'🍗',n:'水煮雞胸肉',ok:1,why:'可以，要煮熟、去骨、不加調味。'},
  {e:'🎃',n:'南瓜',ok:1,why:'可以，蒸熟、不加調味就好。'},
  {e:'🍓',n:'草莓',ok:1,why:'可以，少量當點心。'},
  {e:'🍠',n:'地瓜',ok:1,why:'可以，蒸熟、不加糖。'},
  {e:'🍉',n:'西瓜',ok:1,why:'可以，去皮去籽，少量就好。'},
  {e:'🍌',n:'香蕉',ok:1,why:'可以，但糖分高，一小塊就好。'},
  {e:'🥒',n:'小黃瓜',ok:1,why:'可以，熱量低、水分多。'},
  {e:'🍚',n:'白飯',ok:1,why:'少量可以，不要拌醬油或滷汁。'},
  {img:'img/biscuit/lion.png',n:'阿布最愛的造型餅乾',ok:1,why:'當然可以！不過一天不要吃太多片。'},
  {e:'🍫',n:'巧克力',ok:0,why:'不行！可可鹼會讓狗中毒，黑巧克力更危險。'},
  {e:'🍇',n:'葡萄',ok:0,why:'不行！葡萄和葡萄乾可能讓狗腎衰竭，一顆都不要。'},
  {e:'🧅',n:'洋蔥',ok:0,why:'不行！會破壞紅血球，煮熟的、湯裡的也一樣。'},
  {e:'🧄',n:'大蒜',ok:0,why:'不行！跟洋蔥同一類，也會傷紅血球。'},
  {e:'🥑',n:'酪梨',ok:0,why:'不要給。油脂高，果核還可能卡住腸胃。'},
  {e:'☕',n:'咖啡',ok:0,why:'不行！咖啡因對狗有毒，茶也一樣。'},
  {e:'🍺',n:'啤酒',ok:0,why:'不行！酒精對狗非常危險，一點點都不行。'},
  {e:'🍬',n:'無糖口香糖',ok:0,why:'不行！裡面的木糖醇會讓狗血糖急降、傷肝。'},
  {e:'🦴',n:'煮過的雞骨頭',ok:0,why:'不行！煮過的骨頭容易碎成尖刺，刺傷腸胃。'},
];
function Quiz(){
  const s=h(`<section class="screen"></section>`); s.appendChild(gameBar('阿布能不能吃？','qstat'));
  const card=h(`<div class="quiz">
      <img class="qface" id="qFace" src="${face('face_143')}" alt="">
      <div class="qitem" id="qItem"></div>
      <div class="qname" id="qName"></div>
      <div class="qbtns" id="qBtns"><button class="btn qyes" data-a="1">可以吃</button><button class="btn danger qno" data-a="0">不能吃</button></div>
      <div class="qfb" id="qFb" hidden></div>
    </div>`);
  s.appendChild(card);
  s.appendChild(h(`<p class="hint">每隻狗狗體質不同，不確定的食物先問獸醫。</p>`));
  main.appendChild(s);
  const N=8;
  const yes=FOODS.filter(f=>f.ok).sort(()=>Math.random()-.5), no=FOODS.filter(f=>!f.ok).sort(()=>Math.random()-.5);
  const qs=[...yes.slice(0,N/2),...no.slice(0,N/2)].sort(()=>Math.random()-.5);
  let i=0, right=0;
  const stat=$('#qstat');
  function show(){
    const q=qs[i]; stat.textContent=`第 ${i+1} / ${N} 題　答對 ${right}`;
    $('#qItem').innerHTML= q.img? `<img src="${q.img}" alt="">` : q.e;
    $('#qName').textContent=q.n;
    $('#qFace').src=face('face_143');
    $('#qBtns').hidden=false; $('#qFb').hidden=true;
  }
  card.querySelectorAll('#qBtns button').forEach(b=>b.onclick=()=>{
    const q=qs[i], ok=(+b.dataset.a)===q.ok; if(ok) right++;
    if(ok){ sfx.good(); if(Math.random()<.5) bark(1); } else sfx.bad();
    $('#qFace').src=face(ok? (q.ok?'face_66':'face_60') : 'face_143');
    $('#qBtns').hidden=true;
    const fb=$('#qFb'); fb.hidden=false; fb.className='qfb '+(ok?'good':'bad');
    fb.innerHTML=`<b>${ok?'答對了！':'答錯了～'}</b><p>${q.why}</p><button class="btn" id="qNext">${i+1<N?'下一題':'看結果'}</button>`;
    stat.textContent=`第 ${i+1} / ${N} 題　答對 ${right}`;
    fb.querySelector('#qNext').onclick=()=>{
      i++; if(i<N) return show();
      const bones= right===N? 6 : Math.max(1,Math.ceil(right/2));
      winDialog({title: right===N?'全部答對！':`答對 ${right} / ${N} 題`, text: right===N?'你是阿布最放心的家人。':'多玩幾次，阿布的安全就靠你了。', bones, faceKey: right>=6?'face_66':'face_60', again:()=>go('quiz'),rank:{game:'quiz',score:right}});
    };
  });
  show();
}

/* ================= 阿布短片：每天一支 15 秒直式短片 =================
 * 腳本（主題、挑哪些照片、字幕）由 Apps Script 每天做一支，全家看同一支；
 * 這裡負責「剪輯」：照音樂節拍切換畫面、每張照片慢慢推近到阿布的臉、字幕、配樂。
 * 剪輯規則：開頭第一格就放最強的照片＋大字，不淡入；每 1~2 秒換一次畫面、快切放後段；
 * 切點全部落在拍子上；推近平移一律加減速、方向輪流換、幅度小；以硬切為主，小節開頭輕輕放大一下；收在定格。 */
let REELS = lsGet('abu-reels')||[];               // 最近幾天的短片腳本（新的在前）
let REELS_ON_SERVER = !!lsGet('abu-reels');       // 後端有沒有做短片（舊版 Apps Script 沒有）
let reelState = '';                                // '' 還沒問、'loading' 問後端中、'done' 問完了
const dayKey = (t=Date.now()) => { const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const hashStr = s => { let x=2166136261; for(const ch of String(s)){ x^=ch.codePointAt(0); x=Math.imul(x,16777619); } return x>>>0; };
function seeded(seed){ let x=seed||1; return ()=>{ x=(x+0x6D2B79F5)|0; let t=Math.imul(x^(x>>>15),1|x); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
const headOf = p => (Array.isArray(p.head)&&p.head.length===4)? p.head : (Array.isArray(p.ears)&&p.ears.length===4)? p.ears : null;
const REEL_MAX = {'歡樂':11,'溫馨':8,'搞笑':10};

/* 沒有後端短片時（內建照片、舊版 Apps Script）：用日期當種子，自己挑一支 */
function localReel(day){
  const list=pool(); if(list.length<3) return null;
  const seed=hashStr(day), rnd=seeded(seed);
  const mood=['歡樂','溫馨','搞笑'][seed%3];
  const picks=list.slice().sort(()=>rnd()-.5).slice(0,REEL_MAX[mood]);
  const star=picks.findIndex(p=>p.ears); if(star>0) picks.unshift(picks.splice(star,1)[0]);
  const say=['汪！','看我看我','我乖乖的喔','尾巴搖搖搖','今天也很帥','有零食嗎？','摸摸頭～','我才沒有在等你'];
  const title=['看我看我','今天也很帥','阿布日常','汪！開演囉'][(seed>>>3)%4];
  return { day, key:'local', name:'今天的阿布', mood, title, end:'明天也要陪我喔', local:true,
    shots:picks.map((p,i)=>({id:p.id, say:i%2? '': say[(seed+i/2)%say.length]})) };
}
/* 腳本 → 照片（被刪掉的跳過） */
function reelShots(r){
  const byId={}; pool().forEach(p=>byId[p.id]=p);
  const out=[]; (r.shots||[]).forEach(s=>{ const p=byId[s.id]; if(p&&!out.some(o=>o.p===p)) out.push({p,say:s.say||''}); });
  return out.slice(0,REEL_MAX[r.mood]||11);
}
function reelList(){
  const today=dayKey();
  let list=[];
  if(API_URL&&REELS_ON_SERVER&&PH_STATE!=='sample'&&PH_STATE!=='fail') list=REELS.filter(r=>r&&r.day&&r.day<=today);
  if(!list.some(r=>r.day===today)&&(!API_URL||!REELS_ON_SERVER||PH_STATE==='fail'||reelState==='done')){ const l=localReel(today); if(l) list.unshift(l); }
  return list.filter(r=>reelShots(r).length>=3);
}
async function ensureTodayReel(){
  if(!API_URL||!REELS_ON_SERVER||reelState||REELS.some(r=>r.day===dayKey())) return;
  reelState='loading';
  try{
    const r=await fetch(API_URL+'?action=reel'); const j=await r.json();
    if(j.ok&&Array.isArray(j.reels)){ REELS=j.reels; lsSet('abu-reels',REELS); }
  }catch(e){}
  reelState='done';
  if(current==='album') go('album',true);
}

/* 看短片：2 片餅乾解鎖一支，解鎖後可以一直重看 */
const reelKey = r => r.day+'|'+r.key;
const reelIsOpen = r => (S.reelOpen||[]).includes(reelKey(r));
function playReel(list,idx){
  const r=list[idx]; if(!r) return;
  if(reelIsOpen(r)) return openReel(list,idx);
  if(S.bones<REEL_COST){ sfx.bad(); toast(`看短片要 ${REEL_COST} 片餅乾，還差 ${REEL_COST-S.bones} 片，去玩小遊戲吧`,2600); return; }
  const m=modal(`<h3>看「${esc(r.title)}」？</h3><p>用 ${REEL_COST} 片餅乾，看過之後可以一直重看。你現在有 ${S.bones} 片。</p><div class="row"><button class="btn" id="yes">看短片</button><button class="btn ghost" data-close>先不要</button></div>`);
  m.el.querySelector('#yes').onclick=()=>{ m.el.remove(); addBones(-REEL_COST); S.reelOpen=[...(S.reelOpen||[]).slice(-60),reelKey(r)]; save(); openReel(list,idx); };
}
/* 相簿頁最上面：今天的短片（大卡）＋前幾天的（小卡） */
function reelStrip(){
  const list=reelList(), today=dayKey();
  const box=h(`<section class="reels" aria-label="阿布短片"></section>`);
  const waiting=API_URL&&REELS_ON_SERVER&&PH_STATE!=='fail'&&!list.some(r=>r.day===today)&&reelState!=='done';
  if(!list.length&&!waiting) return box;
  const cover=(r,w)=>{ const s=reelShots(r)[0]; if(!s) return ''; const hd=headOf(s.p);
    const pos=hd? `object-position:${(hd[1]+hd[3])/20}% ${(hd[0]+hd[2])/20}%`:''; return pimg(s.p,w,`alt="" loading="lazy" style="${pos}"`); };
  const md=d=>{ const [y,m,dd]=d.split('-').map(Number); return `${m}/${dd}`; };
  const main=list[0]&&list[0].day===today? list[0]: null;
  if(main){
    const seen=(S.reelSeen||[]).includes(main.day+main.key);
    const open=reelIsOpen(main);
    const b=h(`<button class="reel-main${open?'':' locked'}" aria-label="${open?'播放':'解鎖'}今天的阿布短片：${esc(main.title)}">${cover(main,800)}${open?'':'<span class="veil"></span>'}
      <span class="reel-meta"><span class="reel-tag">${seen?'今日短片':'今日短片・NEW'}</span><b>${esc(main.title)}</b><small>${esc(main.name)}・15 秒${open?'':`・${REEL_COST} 片餅乾解鎖`}</small></span>
      <span class="reel-play"><svg><use href="${open?'#i-play':'#i-lock-d'}"/></svg></span></button>`);
    b.onclick=()=>playReel(list,0);
    box.appendChild(b);
  }else if(waiting){
    box.appendChild(h(`<div class="reel-main making"><span class="reel-meta"><span class="reel-tag">今日短片</span><b>阿布正在剪今天的短片…</b><small>等一下下就好</small></span></div>`));
  }
  const rest=list.filter(r=>r!==main);
  if(rest.length){
    const row=h(`<div class="reel-row"></div>`);
    rest.forEach(r=>{
      const open=reelIsOpen(r);
      const b=h(`<button class="reel-mini${open?'':' locked'}" aria-label="${open?'播放':'解鎖'} ${md(r.day)} 的短片：${esc(r.title)}">${cover(r,300)}${open?'':`<span class="veil"><svg><use href="#i-lock-d"/></svg>${REEL_COST} 片餅乾</span>`}<span class="mtxt"><i>${r.day===today?'今天':md(r.day)}</i><b>${esc(r.title)}</b></span></button>`);
      b.onclick=()=>playReel(list,list.indexOf(r));
      row.appendChild(b);
    });
    box.appendChild(row);
  }
  return box;
}

/* ---------- 配樂：三種心情，在手機上即時合成（沒有版權問題，節拍完全精準） ---------- */
const CH={C:[48,[60,64,67]],G:[43,[59,62,67]],Am:[45,[57,60,64]],F:[41,[57,60,65]],Dm:[38,[57,62,65]],Em:[40,[59,64,67]]};
const SONGS={
  '歡樂':{bpm:128,bars:8,style:'pop',gain:1,prog:['C','G','Am','F','C','G','F','G'],
    mel:[[0,76,.5],[.5,79,.5],[1,84,1],[2,79,.5],[2.5,76,.5],[3,79,1],[4,74,.5],[4.5,79,.5],[5,83,1],[6,81,.5],[6.5,79,.5],[7,74,1],
      [8,72,.5],[8.5,76,.5],[9,81,1],[10,79,.5],[10.5,76,.5],[11,72,1],[12,69,.5],[12.5,72,.5],[13,77,1],[14,76,.5],[14.5,77,.5],[15,79,1],
      [16,76,.5],[16.5,79,.5],[17,84,1],[18,86,.5],[18.5,88,.5],[19,84,1],[20,86,1],[21,83,.5],[21.5,79,.5],[22,81,.5],[22.5,83,.5],[23,79,1],
      [24,81,.5],[24.5,84,.5],[25,81,.5],[25.5,77,.5],[26,79,1],[27,81,1],[28,83,.5],[28.5,86,.5],[29,83,.5],[29.5,79,.5],[30,81,.5],[30.5,83,.5],[31,86,1]],end:84},
  '溫馨':{bpm:96,bars:6,style:'warm',gain:1.4,prog:['C','G','Am','F','Dm','G'],
    mel:[[0,76,1.5],[1.5,74,.5],[2,72,1],[3,67,1],[4,74,1.5],[5.5,72,.5],[6,71,1],[7,67,1],[8,72,1],[9,76,1],[10,81,1.5],[11.5,79,.5],
      [12,77,1],[13,76,1],[14,72,1],[15,69,1],[16,74,1],[17,77,1],[18,81,1],[19,79,.5],[19.5,77,.5],[20,76,1],[21,74,1],[22,71,1],[23,74,1]],end:72},
  '搞笑':{bpm:112,bars:7,style:'fun',gain:3.6,prog:['C','G','C','G','F','C','G'],boing:[15],
    mel:[[0,72],[.5,76],[1,79],[1.5,76],[2,72],[3,67],[3.5,67],[4,71],[4.5,74],[5,79],[5.5,77],[6,74],[6.5,71],[7,67,.5],
      [8,72],[8.5,76],[9,79],[9.5,76],[10,72],[11,67],[11.5,67],[12,71],[12.5,74],[13,79],[13.5,81],[14,83],
      [16,69],[16.5,72],[17,77],[17.5,72],[18,69],[18.5,72],[19,77,.5],[20,79],[20.5,76],[21,72],[21.5,76],[22,79],[22.5,84],
      [24,83],[24.5,82],[25,81],[25.5,80],[26,79,.5],[27,74],[27.5,71]],end:72},
};
const hz = m => 440*Math.pow(2,(m-69)/12);
let SOFT=null;
function softClip(){ if(SOFT) return SOFT; const n=2048; SOFT=new Float32Array(n); for(let i=0;i<n;i++){ const x=(i/(n-1)*2-1)*2, a=Math.abs(x); SOFT[i]=Math.sign(x)*(a<=.8? a : .8+.2*Math.tanh((a-.8)/.2)); } return SOFT; }
function reelMusic(c,mood,dest){
  const P=SONGS[mood]||SONGS['歡樂'], spb=60/P.bpm, beats=P.bars*4, src=[];
  const out=c.createGain(); out.gain.value=P.gain||1; out.connect(dest);          // 三首歌音量拉齊
  const noise=c.createBuffer(1,c.sampleRate,c.sampleRate); { const d=noise.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  const G=(v,dest=out)=>{ const g=c.createGain(); g.gain.value=v; g.connect(dest); return g; };
  const env=(g,t,a,v,d)=>{ g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+a); g.gain.exponentialRampToValueAtTime(.0001,t+a+d); };
  const osc=(type,f,t,end,dest)=>{ const o=c.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t); o.connect(dest); o.start(t); o.stop(end); src.push(o); return o; };
  const nz=(t,end,dest)=>{ const s=c.createBufferSource(); s.buffer=noise; s.loop=true; s.connect(dest); s.start(t,Math.random()*.5); s.stop(end); src.push(s); return s; };
  const filt=(type,f,q,dest)=>{ const b=c.createBiquadFilter(); b.type=type; b.frequency.value=f; if(q) b.Q.value=q; b.connect(dest); return b; };
  const I={
    kick(t,v){ const g=G(0); env(g,t,.003,v*.9,.32); const o=osc('sine',150,t,t+.4,g); o.frequency.exponentialRampToValueAtTime(42,t+.13); },
    clap(t,v){ const g=G(0), f=filt('bandpass',1500,1,g); g.gain.setValueAtTime(.0001,t); [0,.011,.022].forEach(k=>{ g.gain.setValueAtTime(v,t+k); g.gain.exponentialRampToValueAtTime(v*.25,t+k+.009); }); g.gain.exponentialRampToValueAtTime(.0001,t+.2); nz(t,t+.22,f); },
    snare(t,v){ const g=G(0), f=filt('bandpass',1900,.8,g); env(g,t,.002,v,.14); nz(t,t+.18,f); const g2=G(0); env(g2,t,.002,v*.6,.08); osc('triangle',190,t,t+.1,g2); },
    hat(t,v,open){ const g=G(0), f=filt('highpass',7000,0,g); env(g,t,.002,v,open?.22:.035); nz(t,t+(open?.26:.06),f); },
    rim(t,v){ const g=G(0), f=filt('bandpass',2400,4,g); env(g,t,.001,v,.03); nz(t,t+.05,f); const g2=G(0); env(g2,t,.001,v*.5,.025); osc('sine',1700,t,t+.04,g2); },
    shaker(t,v){ const g=G(0), f=filt('bandpass',6500,.7,g); env(g,t,.012,v,.05); nz(t,t+.08,f); },
    crash(t,v){ const g=G(0), f=filt('highpass',4500,0,g); env(g,t,.003,v,1.6); nz(t,t+1.7,f); },
    block(t,fq,v){ const g=G(0), f=filt('bandpass',fq,6,g); env(g,t,.001,v,.05); osc('sine',fq,t,t+.07,f); },
    bass(t,m,d,v){ const g=G(0), f=filt('lowpass',900,1,g); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.006); g.gain.exponentialRampToValueAtTime(v*.55,t+.1); g.gain.setValueAtTime(v*.55,t+Math.max(.1,d-.06)); g.gain.exponentialRampToValueAtTime(.0001,t+d+.05);
      osc('triangle',hz(m),t,t+d+.1,f); osc('sine',hz(m),t,t+d+.1,f); },
    subBass(t,m,d,v){ const g=G(0); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.03); g.gain.setValueAtTime(v,t+d-.15); g.gain.exponentialRampToValueAtTime(.0001,t+d+.1); osc('sine',hz(m),t,t+d+.15,g); osc('triangle',hz(m+12),t,t+d+.15,G(.12,g)); },
    tuba(t,m,d,v){ const g=G(0), f=filt('lowpass',650,2,g); env(g,t,.012,v,d+.08); const o=osc('square',hz(m)*.97,t,t+d+.15,f); o.frequency.exponentialRampToValueAtTime(hz(m),t+.04); },
    pluck(t,m,d,v){ const g=G(0), f=filt('lowpass',3400,1,g); f.frequency.setValueAtTime(3400,t); f.frequency.exponentialRampToValueAtTime(700,t+.25); env(g,t,.003,v,Math.max(.3,d));
      osc('sawtooth',hz(m),t,t+d+.35,f); osc('triangle',hz(m)*1.003,t,t+d+.35,f); },
    ep(t,m,d,v){ const g=G(0); env(g,t,.008,v,d+.5); osc('sine',hz(m),t,t+d+.6,g); osc('sine',hz(m)*2,t,t+d+.6,G(.22,g)); },
    pad(t,ns,d,v){ const g=G(0), f=filt('lowpass',1100,.5,g); g.gain.setValueAtTime(.0001,t); g.gain.linearRampToValueAtTime(v,t+.35); g.gain.setValueAtTime(v,t+d-.1); g.gain.exponentialRampToValueAtTime(.0001,t+d+.6);
      ns.forEach(m=>[-7,7].forEach(ct=>{ const o=osc('sawtooth',hz(m),t,t+d+.7,f); o.detune.value=ct; })); },
    bell(t,m,d,v){ const g=G(0); env(g,t,.003,v,Math.min(1.1,d+.5)); osc('sine',hz(m),t,t+d+.7,g); const g2=G(0); env(g2,t,.002,v*.22,.25); osc('sine',hz(m)*2.76,t,t+.3,g2); },
    pizz(t,m,d,v){ const g=G(0), f=filt('lowpass',2600,1,g); env(g,t,.002,v,.12+d*.4); osc('triangle',hz(m),t,t+d+.3,f); osc('square',hz(m),t,t+d+.3,G(.08,f)); },
    boing(t,v){ const g=G(0); env(g,t,.01,v,.32); const o=osc('sine',170,t,t+.4,g); o.frequency.exponentialRampToValueAtTime(760,t+.28); },
  };
  function start(t0){
    const B=b=>t0+b*spb;
    for(let bar=0;bar<P.bars;bar++){
      const [root,tri]=CH[P.prog[bar]], b0=bar*4, last=bar===P.bars-1;
      if(P.style==='pop'){
        for(let q=0;q<4;q++) I.kick(B(b0+q),bar?1:.8);
        if(bar>0){ I.clap(B(b0+1),.45); I.clap(B(b0+3),.45); }
        for(let e=0;e<8;e++) I.hat(B(b0+e/2),e%2?.16:.07,bar%2===1&&e===7);
        if(last) for(let s=0;s<4;s++) I.snare(B(b0+3+s/4),.18+s*.07);
        { const pat=[0,0,12,0,0,12,0,7]; pat.forEach((k,e)=>I.bass(B(b0+e/2),root+k,spb*.42,bar?.42:.3)); }
        [[0,1,1],[2,.5,.7],[3,.5,.55],[5,.5,.7],[6,.5,.55],[7,.5,.75]].forEach(([e,len,v],k)=>{
          const up=k%2===1, ns=up? tri.slice().reverse(): tri;
          ns.forEach((m,j)=>I.pluck(B(b0+e/2)+j*.012,m,spb*len,.09*v));
        });
      }else if(P.style==='warm'){
        I.pad(B(b0),tri,spb*4,.035);
        const tones=[tri[0],tri[1],tri[2],tri[0]+12];
        [0,1,2,3,2,1,2,3].forEach((k,e)=>I.ep(B(b0+e/2),tones[k],spb*.9,e%2?.07:.1));
        I.subBass(B(b0),root+12,spb*2.4,.3); I.subBass(B(b0+2.5),root+12,spb*1.4,.24);
        if(bar>0){ I.kick(B(b0),.7); I.kick(B(b0+2.5),.5); I.rim(B(b0+1),.3); I.rim(B(b0+3),.3); for(let e=0;e<8;e++) I.shaker(B(b0+e/2),e%2?.05:.08); }
      }else{
        I.tuba(B(b0),root,spb*.35,.32); I.tuba(B(b0+2),root+7,spb*.35,.28);
        [1,3].forEach(q=>tri.forEach(m=>I.pluck(B(b0+q),m,spb*.18,.07)));
        for(let q=0;q<4;q++) I.block(B(b0+q+.5),q%2?900:1250,.18);
        if(bar>0){ I.kick(B(b0),.34); I.kick(B(b0+2),.28); I.clap(B(b0+1),.2); I.clap(B(b0+3),.2); }
      }
    }
    P.mel.forEach(([b,m,len])=>{
      if(P.style==='pop') I.bell(B(b),m,spb*len,.16);
      else if(P.style==='warm') I.bell(B(b),m,spb*len,.13);
      else I.pizz(B(b),m,spb*(len||.25),.2);
    });
    (P.boing||[]).forEach(b=>I.boing(B(b),.22));
    const E=B(beats), [r0,t0c]=CH.C;
    I.kick(E,P.style==='fun'?.4:1); I.crash(E,P.style==='fun'?.1:.22);
    if(P.style==='pop'){ t0c.forEach(m=>I.pluck(E,m,1.4,.1)); I.bass(E,r0,1.2,.4); I.bell(E,P.end,1.4,.18); }
    else if(P.style==='warm'){ I.pad(E,t0c,1.8,.04); t0c.forEach(m=>I.ep(E,m,1.6,.08)); I.subBass(E,r0+12,1.6,.3); I.bell(E,P.end,1.6,.14); }
    else { t0c.forEach(m=>{ I.pluck(B(beats-.5),m,spb*.2,.07); I.pluck(E,m,1.1,.08); }); I.tuba(E,r0,.6,.32); I.pizz(E,P.end,.5,.2); I.pizz(E,P.end+12,.5,.1); }
  }
  return { bpm:P.bpm, bars:P.bars, spb, beats, start, stop(){ src.forEach(s=>{ try{ s.stop(); }catch(e){} }); } };
}

/* 每張照片幾拍：第一張 4 拍（壓開頭大字），最後一張 4 拍（收尾定格），中間 2/4/8 拍，快切放在後段越剪越快 */
function reelTiming(n,bars){
  const mid=Math.max(0,n-2), T=(bars-2)*4, d=[];
  if(!mid) return n<2? [bars*4] : [4,bars*4-4];
  if(mid*4>=T){
    const twos=Math.min(mid,2*mid-T/2), pairs=twos/2; let fours=mid-twos, p=pairs;
    const seq=[]; while(fours||p){ if(p){ seq.unshift(2,2); p--; } if(fours){ seq.unshift(4); fours--; } }
    d.push(...seq);
  }else{
    const units=bars-2, base=Math.floor(units/mid); let extra=units-base*mid;
    for(let i=0;i<mid;i++){ d.push((base+(extra>0?1:0))*4); extra--; }
  }
  return [4,...d,4];
}

/* ---------- 播放器 ---------- */
function openReel(list,idx){
  const reel=list[idx]; if(!reel) return;
  const c=ac();                                            // 一定要在點擊當下叫醒聲音（iPhone 的規定）
  try{ if(navigator.audioSession) navigator.audioSession.type='playback'; }catch(e){}   // iPhone 靜音鍵開著也有聲音
  const items=reelShots(reel);
  const P=SONGS[reel.mood]||SONGS['歡樂'];
  const md=d=>{ const a=d.split('-').map(Number); return `${a[1]}/${a[2]}`; };
  const ov=h(`<div class="reel-ov" role="dialog" aria-label="阿布短片：${esc(reel.title)}">
    <div class="reel-shots"></div><div class="reel-flash"></div>
    <div class="reel-title" hidden></div><div class="reel-say" hidden></div>
    <div class="reel-top"><div class="reel-bar"><i></i></div>
      <div class="reel-head"><span class="rname">${esc(reel.name)}</span><span class="rday">${reel.day===dayKey()?'今天':md(reel.day)}</span>
      <button class="reel-btn" data-a="mute" aria-label="聲音開關"><svg><use href="${S.sound?'#i-snd-w':'#i-mute-w'}"/></svg></button>
      <button class="reel-btn" data-a="close" aria-label="關閉短片"><svg><use href="#i-x-w"/></svg></button></div></div>
    <div class="reel-load"><img src="${face('face_143')}" alt=""><b>阿布準備中…</b><span>0 / ${items.length}</span></div>
    <div class="reel-paused" hidden><svg><use href="#i-play"/></svg></div>
  </div>`);
  app.appendChild(ov);
  const $$=s=>ov.querySelector(s), shotsEl=$$('.reel-shots'), bar=$$('.reel-bar i'), titleEl=$$('.reel-title'), sayEl=$$('.reel-say'), flash=$$('.reel-flash');
  let alive=true, raf=0, music=null, bus=null, useAudio=false, t0=0, perfBase=0, perfOff=0, paused=false, started=false, ended=false;
  let shots=[], cur=-1, sayAt=-9, W=0, H=0, TOTAL=0, TAIL=1.8;
  const spb=60/P.bpm;

  /* 載照片：用大一點的圖（推近才不會糊），失敗就換備用網址 */
  const loadOne=p=>new Promise(res=>{
    const im=new Image(); im.decoding='async';
    im.onload=()=>{ (im.decode? im.decode().catch(()=>{}): Promise.resolve()).then(()=>res(im)); };
    im.onerror=()=>{ if(!p.sample&&!im.dataset.fb){ im.dataset.fb='1'; im.src=`https://drive.google.com/thumbnail?id=${p.id}&sz=w1600`; } else res(null); };
    im.src= p.url || `https://lh3.googleusercontent.com/d/${p.id}=s1600`;
  });
  /* 影片片段：直接跟雲端硬碟要檔案來播（靜音，配樂蓋過去）；9 秒內準備不好、或手機播不了這種格式，就改用縮圖 */
  const loadVid=it=>new Promise(res=>{
    const v=document.createElement('video'); let done=false;
    v.muted=true; v.defaultMuted=true; v.playsInline=true; v.preload='auto'; v.setAttribute('playsinline',''); v.setAttribute('muted',''); v.className='rvid';
    const fin=ok=>{ if(done) return; done=true; clearTimeout(t); if(ok) it.vid=v; else { v.removeAttribute('src'); try{ v.load(); }catch(e){} } res(); };
    const t=setTimeout(()=>fin(false),8000);
    v.onloadedmetadata=()=>{
      const d=isFinite(v.duration)? v.duration : (it.p.v[0]||0); it.vstart=Math.max(0,Math.min(d*.3,d-3.2));
      try{ v.currentTime=it.vstart; }catch(e){}
      // iPhone 不會先下載影片內容：靜音播一下再停，逼它先緩衝好
      const pr=v.play(); if(pr&&pr.then) pr.then(()=>{ v.pause(); try{ v.currentTime=it.vstart; }catch(e){} fin(true); }).catch(()=>fin(false)); else fin(true);
    };
    v.onerror=()=>fin(false);
    v.src=`https://drive.google.com/uc?export=download&id=${encodeURIComponent(it.p.id)}`;
  });
  let got=0;
  const timeout=new Promise(r=>setTimeout(()=>r('timeout'),15000));
  const loads=items.map(it=>Promise.all([loadOne(it.p),isVid(it.p)&&!it.p.sample? loadVid(it): null]).then(([im])=>{ got++; const s=$$('.reel-load span'); if(s) s.textContent=`${got} / ${items.length}`; it.im=im; return im; }));
  Promise.race([Promise.all(loads),timeout]).then(()=>{
    if(!alive) return;
    shots=items.filter(it=>it.im&&it.im.naturalWidth);
    if(shots.length<3){ $$('.reel-load').innerHTML=`<img src="${face('face_143')}" alt=""><b>照片載入失敗</b><span>網路不穩，等一下再試</span>`; return; }
    begin();
  });

  function begin(){
    const beatsOf=reelTiming(shots.length,P.bars); let b=0;
    shots.forEach((s,i)=>{
      s.b0=b; s.beats=beatsOf[i]; b+=s.beats;
      s.say = i===shots.length-1? (reel.end||s.say) : i===0? '' : s.say;
      const wrap=document.createElement('div'); wrap.className='reel-shot'; shotsEl.appendChild(wrap);   // 不要用 h()：template 裡的元素會讓照片重新載入
      s.im.alt=''; s.im.draggable=false; wrap.appendChild(s.im); s.el=wrap;
      if(s.vid){ wrap.appendChild(s.vid); s.vid.onerror=()=>{ s.vid.remove(); s.vid=null; }; }   // 影片蓋在縮圖上面，播不了就露出縮圖
    });
    TOTAL=P.bars*4*spb;
    layout();
    $$('.reel-load').remove();
    titleEl.textContent=reel.title||reel.name; titleEl.hidden=false;
    { const s0=shots[0], hd=headOf(s0.p);                  // 開頭大字不要蓋住阿布的臉：臉在上半部就把字放下面
      if(hd){ const S2=s0.s0*s0.B.k, cy=Math.min(Math.max(s0.B.cy,H/2/S2),s0.h-H/2/S2), y=H/2+((hd[0]+hd[2])/2000*s0.h-cy)*S2; titleEl.style.top= y<H*.5? '58%':'16%'; } }
    /* 開始：有聲音就用聲音的時鐘，畫面和拍子完全對齊 */
    if(c&&c.state==='running'){
      useAudio=true;
      bus=c.createGain(); bus.gain.value=S.sound?1:0;
      const comp=c.createDynamicsCompressor(); comp.threshold.value=-16; comp.ratio.value=4; comp.attack.value=.004; comp.release.value=.2;
      const master=c.createGain(); master.gain.value=.6;
      const pre=c.createGain(); pre.gain.value=.5; const lim=c.createWaveShaper(); lim.curve=softClip(); lim.oversample='2x';   // 保護耳朵：超過的音量柔和壓住，不會爆音
      bus.connect(comp).connect(master).connect(pre).connect(lim).connect(c.destination);
      bus._chain=[comp,master,pre,lim];
      music=reelMusic(c,reel.mood,bus);
      t0=c.currentTime+.12; music.start(t0);
    }else{ perfBase=performance.now()/1000+.05; }
    started=true; paint(0); raf=requestAnimationFrame(frame);
  }
  const now=()=> useAudio? c.currentTime-t0 : (paused? perfOff : perfOff+performance.now()/1000-perfBase);

  /* Ken Burns：每張照片決定起點和終點（倍率、中心），終點盡量停在阿布的臉 */
  function layout(){
    W=ov.clientWidth; H=ov.clientHeight;
    const dpr=Math.min(3,window.devicePixelRatio||1);
    const MOVES=['pan','out','in','pan','in','out']; let pans=0;
    shots.forEach((s,i)=>{
      const w=s.im.naturalWidth, hh=s.im.naturalHeight, s0=Math.max(W/w,H/hh);
      s.w=w; s.h=hh; s.s0=s0;
      s.im.style.width=w*s0+'px'; s.im.style.height=hh*s0+'px';
      if(s.vid){ s.vid.style.width=s.im.style.width; s.vid.style.height=s.im.style.height; }
      const last=i===shots.length-1, dur=s.beats*spb+(last?TAIL:0);
      let type= i===0||last? 'in' : MOVES[(i-1)%MOVES.length];
      const hd=headOf(s.p);
      let fx=w/2, fy=hh*.42, kf=1.12;
      if(hd){ fx=(hd[1]+hd[3])/2000*w; fy=(hd[0]+hd[2])/2000*hh; const hs=Math.max((hd[3]-hd[1])/1000*w,(hd[2]-hd[0])/1000*hh)*s0; kf=Math.min(1.42,Math.max(1.08,Math.min(W,H)*.66/hs)); }
      kf=Math.min(kf, Math.pow(1.16,Math.max(1,dur)), Math.max(1.05,2.1/(s0*dpr)));
      if(s.vid){ kf=Math.min(kf,1.06); type='in'; }                                  // 影片本身會動，鏡頭只輕輕推   // 慢慢推：每秒最多放大 16%，也不超過照片解析度
      const lerp=(a,b,t)=>a+(b-a)*t, F={k:kf,cx:fx,cy:fy}, soft={k:1,cx:lerp(w/2,fx,.45),cy:lerp(hh/2,fy,.45)};
      s.A=soft; s.B=F;
      if(type==='pan'){
        const k=1.05, S2=s0*k, hw=W/2/S2, hh2=H/2/S2, travel=W*.2*dur/S2;   // 平移速度：每秒約 1/5 個畫面寬
        const dir=pans++%2? -1: 1;
        if(w-2*hw>w*.1){ const bx=Math.min(Math.max(fx,hw),w-hw); const ax=Math.min(Math.max(bx-dir*travel,hw),w-hw); if(Math.abs(bx-ax)>w*.03){ s.A={k,cx:ax,cy:fy}; s.B={k,cx:bx,cy:fy}; type='done'; } }
        if(type==='pan'&&hh-2*hh2>hh*.1){ const by=Math.min(Math.max(fy,hh2),hh-hh2); const ay=Math.min(Math.max(by+dir*H*.2*dur/S2,hh2),hh-hh2); if(Math.abs(by-ay)>hh*.03){ s.A={k,cx:fx,cy:ay}; s.B={k,cx:fx,cy:by}; type='done'; } }
        if(type==='pan') type= dir>0? 'in':'out';
      }
      if(type==='out'){ s.A=F; s.B=soft; }
      s.dur=dur; s.first=i===0;
    });
    if(cur>=0) paint(now());
  }
  const easeIO=x=>-(Math.cos(Math.PI*x)-1)/2, easeO=x=>Math.sin(x*Math.PI/2), easeOC=x=>1-Math.pow(1-x,3);
  function place(s,p,punch){
    const e=s.first? easeO(p): easeIO(p);
    const k=s.A.k*Math.pow(s.B.k/s.A.k,e)*punch, S2=s.s0*k, hw=W/2/S2, hh=H/2/S2;
    const cx=Math.min(Math.max(s.A.cx+(s.B.cx-s.A.cx)*e,hw),s.w-hw), cy=Math.min(Math.max(s.A.cy+(s.B.cy-s.A.cy)*e,hh),s.h-hh);
    s.im.style.transform=`translate3d(${(W/2-cx*S2).toFixed(2)}px,${(H/2-cy*S2).toFixed(2)}px,0) scale(${k.toFixed(4)})`;
    if(s.vid) s.vid.style.transform=s.im.style.transform;
  }
  function say(text,big){
    sayEl.textContent=text; sayEl.hidden=!text; sayEl.classList.toggle('big',!!big);
    sayEl.classList.remove('pop'); void sayEl.offsetWidth; if(text) sayEl.classList.add('pop');
  }
  function paint(t){
    const beat=t/spb;
    let i=shots.findIndex(s=>beat<s.b0+s.beats); if(i<0) i=shots.length-1;
    const s=shots[i];
    if(i!==cur){
      if(cur>=0){ shots[cur].el.classList.remove('on'); if(shots[cur].vid) shots[cur].vid.pause(); }
      s.el.classList.add('on'); cur=i;
      if(s.vid&&!paused){ const v=s.vid; v.play().catch(()=>{ v.remove(); s.vid=null; }); }
      if(i>=1) titleEl.hidden=true;
      if(s.say){ say(s.say,i===shots.length-1); sayAt=t; }
    }
    if(!s.say&&t-sayAt>2.6&&!sayEl.hidden) sayEl.hidden=true;
    const st=s.b0*spb, since=t-st;
    const onBar=i>0&&s.b0%4===0, punch= onBar&&since<.26? 1+.055*(1-easeOC(Math.max(0,since)/.26)) : 1;
    place(s,Math.min(1,Math.max(0,since/s.dur)),punch);
    flash.style.opacity= i===1&&since<.22? (.45*(1-since/.22)).toFixed(3) : 0;
    bar.style.width=Math.min(100,t/TOTAL*100)+'%';
  }
  function frame(){
    if(!alive) return;
    const t=Math.max(0,now());
    paint(t);
    if(!ended&&t>=TOTAL+.35) finish();
    if(t<TOTAL+TAIL+.2) raf=requestAnimationFrame(frame);
  }
  function finish(){
    ended=true;
    const first=!(S.reelSeen||[]).includes(reel.day+reel.key);
    if(first){ S.reelSeen=[...(S.reelSeen||[]).slice(-30),reel.day+reel.key]; save(); addLove(2); }
    const older=list[idx+1];
    const end=h(`<div class="reel-end">
      <img class="face-img" src="${face('face_66')}" alt="">
      <h3>${esc(reel.name)}</h3>
      ${first?'<div class="gain">阿布好感 +2</div>':''}
      <div class="row"><button class="btn" data-a="again">再看一次</button>${older?`<button class="btn ghost-w" data-a="next">看 ${older.day===dayKey()?'今天':md(older.day)} 的${reelIsOpen(older)?'':`（${REEL_COST} 片）`}</button>`:''}</div>
      <button class="btn ghost-w" data-a="close">回相簿</button>
    </div>`);
    ov.appendChild(end);
    if(first) setTimeout(()=>{ bark(2); },350);
  }
  function stopAudio(){
    if(music){ try{ bus.gain.setTargetAtTime(0,c.currentTime,.03); }catch(e){} const m=music, b=bus; setTimeout(()=>{ m.stop(); try{ b.disconnect(); b._chain.forEach(n=>n.disconnect()); }catch(e){} },200); music=null; }
    if(c&&c.state==='suspended') c.resume();
  }
  function close(){
    if(!alive) return; alive=false; cancelAnimationFrame(raf); stopAudio();
    items.forEach(it=>{ if(it.vid){ it.vid.pause(); it.vid.removeAttribute('src'); try{ it.vid.load(); }catch(e){} } });
    document.removeEventListener('visibilitychange',onVis); window.removeEventListener('resize',onResize);
    ov.remove();
    if(current==='album') go('album',true);
  }
  function togglePause(){
    if(!started||ended) return;
    paused=!paused; $$('.reel-paused').hidden=!paused;
    const cv=cur>=0&&shots[cur].vid; if(cv){ paused? cv.pause() : cv.play().catch(()=>{}); }
    if(useAudio){ paused? c.suspend(): c.resume(); }
    else if(paused){ perfOff=perfOff+performance.now()/1000-perfBase; } else { perfBase=performance.now()/1000; }
    if(!paused){ cancelAnimationFrame(raf); raf=requestAnimationFrame(frame); }
  }
  const onVis=()=>{ if(document.hidden&&!paused&&!ended) togglePause(); };
  const onResize=()=>{ if(started) layout(); };
  document.addEventListener('visibilitychange',onVis); window.addEventListener('resize',onResize);

  /* 操作：點一下暫停、往上滑看前一天、往下滑看後一天 */
  let y0=null, x0=null;
  ov.addEventListener('pointerdown',e=>{ y0=e.clientY; x0=e.clientX; });
  ov.addEventListener('pointerup',e=>{
    const btn=e.target.closest('[data-a]');
    if(btn){ const a=btn.dataset.a; y0=null;
      if(a==='close') return close();
      if(a==='mute'){ S.sound=!S.sound; save(); renderTop(); btn.querySelector('use').setAttribute('href',S.sound?'#i-snd-w':'#i-mute-w'); if(bus) bus.gain.setTargetAtTime(S.sound?1:0,c.currentTime,.05); return; }
      if(a==='again'){ close(); return openReel(list,idx); }
      if(a==='next'){ close(); return playReel(list,idx+1); }
      return;
    }
    if(y0===null) return;
    const dy=e.clientY-y0, dx=e.clientX-x0; y0=null;
    if(dy<-70&&Math.abs(dy)>Math.abs(dx)){ if(list[idx+1]){ close(); playReel(list,idx+1); } return; }
    if(dy>70&&Math.abs(dy)>Math.abs(dx)){ close(); if(list[idx-1]) playReel(list,idx-1); return; }
    if(Math.abs(dy)<12&&Math.abs(dx)<12&&!ended) togglePause();
  });
  ov.addEventListener('contextmenu',e=>e.preventDefault());
}

/* ---------------- 啟動 ---------------- */
renderTop(); go('home'); loadPhotos(false);
