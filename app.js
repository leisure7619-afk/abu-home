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
const UNLOCK_COST = 2;
/* 阿布最愛的餅乾：牛肉、羊肉、雞肉三種口味 */
const SHAPES = ['strawberry','bear','bone','lion','apple','rabbit','grape','monkey'].map(n=>'img/biscuit/'+n+'.png');
const FLAVORS = [{n:'牛肉',c:'#9C5A2E'},{n:'羊肉',c:'#BF8543'},{n:'雞肉',c:'#DDB067'}];
const NEW_DAYS = 7;
const FREE_OPEN = 4;
const LEVELS = ['初次見面','認識一下','好朋友','散步夥伴','最愛的家人','阿布的全世界'];
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
const isOpen = p => ['美食','洗澡','上廁所'].includes(p.cat) || S.unlocked.includes(p.id) || isRecent(p);
const openPhotos = () => { const o=pool().filter(isOpen); return o.length? o: pool().slice(0,FREE_OPEN); };
function ensureFree(){
  const list=pool(); let n=list.filter(isOpen).length;
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
    lsSet('abu-photos',{photos:PH,config:CONFIG});
  }catch(e){
    PH_STATE = PH.length? 'cached':'fail';
    if(!PH.length) toast('連不上雲端相簿，先用內建照片');
  }
  ensureFree(); renderTop();
  if(current==='album'||current==='food') go(current,true);
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
function addLove(n){ S.love+=n; save(); if(current==='home') renderLove(); }
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
  const navTab={memory:backTo,catch:backTo,puzzle:backTo,bowl:backTo,quiz:backTo}[tab]||tab;
  document.querySelectorAll('nav button').forEach(b=>b.toggleAttribute('aria-current',false));
  const nb=document.querySelector(`nav button[data-tab="${navTab}"]`); if(nb) nb.setAttribute('aria-current','page');
  main.innerHTML='';
  ({home:Home,games:Games,album:Album,food:Food,memory:Memory,catch:Catch,puzzle:Puzzle,bowl:Bowl,quiz:Quiz})[tab]();
  main.scrollTop=keepScroll? y: 0;
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{ sfx.pop(); go(b.dataset.tab); });

/* ================= 主畫面 ================= */
function levelInfo(){ const per=40; const lv=Math.floor(S.love/per); return {lv:lv+1,title:LEVELS[Math.min(lv,LEVELS.length-1)],pct:(S.love%per)/per*100,left:per-S.love%per}; }
function renderLove(){
  const L=levelInfo(), el=$('#love'); if(!el) return;
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
  { at:13, faces:['face_68'],             lines:['最喜歡你了！','汪！汪！','今天最棒了'], hearts:4, label:'超開心' },
  { at:19, faces:['face_66'],             lines:['汪汪汪！！','開心到飛起來！','全世界最幸福的狗！'], hearts:6, label:'開心到爆炸' },
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
  if(isBirthday()){ line='今天是我的生日！汪！'; mood='bday'; }
  S.lastSeen=now; S.lastDay=today; save();
  return {line,gift,mood,missed,first};
}

function Home(){
  const s=h(`<section class="screen">
    <div id="lostBox"></div>
    <div class="love" id="love"><span class="lv">Lv.1</span><span class="title"></span><span class="num"></span><div class="bar"><i></i></div></div>
    <div class="stage">
      <div class="bubble" id="bubble">汪！</div>
      <div class="abu" id="abu" role="button" tabindex="0" aria-label="摸摸阿布"><img id="abuImg" alt="阿布"></div>
      <div class="fx" id="fx"></div>
    </div>
    <div class="joy" id="joy" aria-live="polite"><span class="joy-dots">${LADDER.map(()=>'<i></i>').join('')}</span><span class="joy-label" id="joyLabel">點阿布的臉摸摸他，越摸越開心</span></div>
    <div class="actions">
      <button class="act" id="aPet"><svg><use href="#i-hand"/></svg>摸摸<small>按住是抓抓</small></button>
      <button class="act" id="aFeed"><img class="ico" src="img/biscuit/bear.png" alt="">餵餅乾<small>用 1 片 · +5 好感</small></button>
      <button class="act" id="aWalk"><svg><use href="#i-leash"/></svg>去散步<small>+2 好感</small></button>
    </div>
  </section>`);
  main.appendChild(s); renderLove(); renderLost();
  const img=$('#abuImg'), abu=$('#abu'), bubble=$('#bubble'), fx=$('#fx'), joy=$('#joy');
  let state='normal', revert=null, idle=null, combo=0, tier=-1, decay=null, lastTap=0, bigParty=0;
  let holdT=null, blissT=null, bliss=false;
  const setFace=k=>{ if(img.dataset.k===k) return; img.dataset.k=k; img.src=face(k); };
  const say=(t,big)=>{ bubble.textContent=t; bubble.classList.remove('pop','big'); void bubble.offsetWidth; bubble.classList.add(big?'big':'pop'); setTimeout(()=>bubble.classList.remove('pop'),250); };
  const zzz=h('<div class="zzz" aria-hidden="true">Z z z</div>');
  const petHand=h('<div class="pet-hand" aria-hidden="true"><svg viewBox="0 0 64 84"><use href="#i-pethand"/></svg></div>');
  abu.appendChild(petHand);
  let rubDist=0, lastX=null, lastY=null;
  const hat=h(`<svg class="hat" aria-hidden="true"><use href="#i-hat"/></svg>`);
  const resetIdle=()=>{ clearTimeout(idle); idle=setTimeout(sleep,20000); };
  const baseFace=()=> tier>=0? LADDER[tier].faces[0] : FACES.normal;

  function renderJoy(){
    joy.querySelectorAll('.joy-dots i').forEach((d,i)=>d.classList.toggle('on',i<=tier));
    joy.classList.toggle('max',tier===LADDER.length-1);
    abu.dataset.tier=tier;
    $('#joyLabel').textContent = bliss? '瞇眼享受中…' : tier<0? '點阿布的臉摸摸他，越摸越開心' : `開心度：${LADDER[tier].label}`;
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
      addLove(3); scheduleDecay(); return;
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
    addLove(tier>=3?2:1);
    scheduleDecay();
  }
  function party(){
    abu.classList.add('party'); setTimeout(()=>abu.classList.remove('party'),1600);
    hearts(16,undefined,undefined,140); sfx.win();
    addLove(5); toast('阿布開心到爆炸！好感 +5');
  }
  /* 按住 = 抓抓：瞇眼享受 */
  function holdStart(){
    clearTimeout(holdT);
    holdT=setTimeout(()=>{
      if(state==='sleep') return;
      bliss=true; clearTimeout(decay); clearTimeout(revert); setFace('face_62'); say('（瞇眼）好舒服…'); renderJoy();
      abu.classList.add('bliss'); petHand.classList.add('on'); let n=0;
      const blissLines=['（瞇眼）好舒服…','再往左邊一點','耳朵後面也要','（頭一直往你手上靠）','不要停～','（整隻融化了）'];
      blissT=setInterval(()=>{ hearts(1); if(++n%3===0) addLove(1); if(n%5===0) tone(330,.25,'sine',.06,-40); if(n%6===0) say(blissLines[(n/6)%blissLines.length|0]); },450);
    },650);
  }
  function holdEnd(){
    clearTimeout(holdT);
    if(!bliss) return;
    bliss=false; clearInterval(blissT); abu.classList.remove('bliss'); petHand.classList.remove('on'); petHand.style.left=''; lastX=null;
    tier=Math.max(tier,2); combo=Math.max(combo,LADDER[2].at); renderJoy();
    setFace(pick(LADDER[tier].faces)); say(pick(['再抓一下嘛','好舒服喔','那邊那邊！'])); scheduleDecay();
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
    if(rubDist>90){ rubDist=0; hearts(1,e.clientX-fx.getBoundingClientRect().left,r.top-fx.getBoundingClientRect().top+r.height*.2,20); addLove(1); tone(360+Math.random()*60,.12,'sine',.05,-30); }
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>abu.addEventListener(ev,holdEnd));
  abu.addEventListener('contextmenu',e=>e.preventDefault());
  abu.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pet(); } });
  $('#aPet').onclick=()=>pet();

  /* 餵食：短時間吃太多會說吃飽了，不扣餅乾 */
  $('#aFeed').onclick=()=>{
    ac(); resetIdle(); wake();
    const now=Date.now(); S.fed=(S.fed||[]).filter(t=>now-t<30*60000);
    if(S.fed.length>=5){ mood('face_62',1800); say(pick(['吃飽了，肚子圓圓的～','等一下再吃好不好','（打嗝）'])); tone(260,.3,'sine',.08,-60); save(); return; }
    if(S.bones<1){ say(pick(LINES.noBone)); mood(pick(FACES.look)); sfx.bad(); return; }
    addBones(-1); S.fed.push(now); save();
    const fi=Math.floor(Math.random()*3), fl=FLAVORS[fi];
    clearTimeout(revert); setFace('face_143'); say('餅乾！？');           // 聽到餅乾，耳朵立起來
    const b=h(`<img class="flying-bone" src="${pick(SHAPES)}" alt="">`); fx.appendChild(b); setTimeout(()=>b.remove(),650);
    setTimeout(()=>{
      abu.classList.remove('chomp'); void abu.offsetWidth; abu.classList.add('chomp');
      mood('face_66',1800); say(S.fed.length===4? '再一口就飽了！' : pick([`${fl.n}口味的！咔滋咔滋`,`最喜歡${fl.n}的了！`,...LINES.eat])); sfx.crunch(); hearts(5); addLove(5);
      if(tier<1){ tier=1; combo=LADDER[1].at; renderJoy(); scheduleDecay(); }
    },450);
  };
  $('#aWalk').onclick=()=>{
    ac(); resetIdle(); wake(); bark(2);
    const p=pick(openPhotos());
    addLove(2);
    modal(`<h3>出門散步囉！</h3>${pimg(p,1200,`class="big-photo" alt="${esc(p.cap||'阿布')}"`)}${p.cap?`<p>${esc(p.cap)}</p>`:''}<button class="btn" data-close>回家</button>`,()=>{
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
  const chatter=setInterval(()=>{ if(state!=='sleep'&&!bliss&&tier<0&&Date.now()-lastTap>8000) say(Math.random()<.25&&bathInfo().state==='due'? '我好像有點狗味了…該洗澡了嗎？' : pick(LINES.idle)); },9000);
  cleanup=()=>{ clearTimeout(idle); clearTimeout(revert); clearTimeout(decay); clearTimeout(holdT); clearInterval(blissT); clearInterval(chatter); };
}

/* ================= 小遊戲清單 ================= */
function Games(){
  const s=h(`<section class="screen">
    <div><h2>小遊戲</h2><p class="sub">贏了拿餅乾，餅乾可以餵阿布，也可以解鎖回憶照片。</p></div>
    <button class="game-card" data-g="memory"><img class="thumb" src="img/face_60.jpg" alt=""><div><b>回憶翻牌</b><span>翻開兩張一樣的照片</span></div><span class="reward">+3~8<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="catch"><img class="thumb" src="${face('face_68')}" alt=""><div><b>阿布接零食</b><span>左右滑動接住食物，巧克力、葡萄、洋蔥不能吃</span></div><span class="reward">+1~10<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="puzzle"><img class="thumb" src="img/face_142.jpg" alt=""><div><b>照片拼圖</b><span>點兩塊交換位置，拼回原來的照片</span></div><span class="reward">+5<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="bowl"><img class="thumb" src="img/face_66.jpg" alt=""><div><b>幫阿布裝飯</b><span>按住倒飼料，倒到剛剛好的份量</span></div><span class="reward">+3~12<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
    <button class="game-card" data-g="quiz"><img class="thumb" src="img/face_143.jpg" alt=""><div><b>阿布能不能吃？</b><span>葡萄可以嗎？地瓜呢？考考你</span></div><span class="reward">+1~6<img class="ico" src="img/biscuit/bear.png" alt=""></span></button>
  </section>`);
  s.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{ sfx.pop(); ac(); backTo='games'; go(b.dataset.g); });
  main.appendChild(s);
}
function gameBar(title,statId){
  const bar=h(`<div class="gamebar"><button class="back" aria-label="返回"><svg><use href="#i-back"/></svg></button><h2>${title}</h2><span class="stat" id="${statId}"></span></div>`);
  bar.querySelector('.back').onclick=()=>go(backTo);
  return bar;
}
function winDialog({title,text,bones,faceKey='face_60',again}){
  sfx.win(); setTimeout(()=>bark(2),500); addBones(bones);
  const m=modal(`<img class="face-img" src="${face(faceKey)}" alt=""><h3>${title}</h3><p>${text}</p><div class="gain">+${bones}<img class="ico" src="img/biscuit/bear.png" alt=""></div><div class="row"><button class="btn" id="again">再玩一次</button><button class="btn ghost" data-close>${backTo==='food'?'回日常':'回小遊戲'}</button></div>`,()=>go(backTo));
  m.el.querySelector('#again').onclick=()=>{ m.el.remove(); again(); };
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
            if(found===6){ const bones=Math.max(3,Math.min(8,14-moves)); setTimeout(()=>winDialog({title:'全部配對成功！',text:`只翻了 ${moves} 次，阿布說你記性真好。`,bones,again:()=>go('memory')}),500); }
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
    winDialog({title: lives<=0?'吃到不能吃的了！':'時間到！', text:`拿到 ${score} 分${nb?'，新紀錄！':`（最高 ${best} 分）`}`, bones, faceKey: lives<=0?'face_143':'face_66', again:()=>{ intro(); }});
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
        setTimeout(()=>winDialog({title:'拼好了！',text:`${p.cap?`「${esc(p.cap)}」，`:''}交換了 ${moves} 次。`,bones:5,faceKey:'face_65',again:()=>go('puzzle')}),800);
      }
    }
    draw();
    const onR=()=>layout(); window.addEventListener('resize',onR);
    cleanup=()=>window.removeEventListener('resize',onR);
  }
}

/* ================= 相簿 ================= */
function Album(){
  const list=[...pool()].filter(p=>!p.cat).sort((a,b)=>((b.taken?1:0)-(a.taken?1:0)) || ((b.taken||b.t||0)-(a.taken||a.t||0)));
  const s=h(`<section class="screen">
    <div class="album-head"><div><h2 id="albumTitle">回憶相簿</h2><p class="sub">解鎖一張 ${UNLOCK_COST} 片餅乾，最近 ${NEW_DAYS} 天的新照片免費看</p></div>
      <button class="btn sm" id="upBtn"><svg><use href="#i-plus"/></svg>上傳</button></div>
    <p class="progress" id="prog"></p>
    <div class="album" id="grid"></div>
  </section>`);
  main.appendChild(s);
  $('#upBtn').onclick=()=>{ sfx.pop(); uploadDialog(); };
  const g=$('#grid');
  const open=list.filter(isOpen).length;
  $('#prog').textContent = PH_STATE==='loading'&&!PH.length? '從雲端硬碟讀照片中…'
    : `已解鎖 ${open} / ${list.length} 張${PH_STATE==='sample'?'（內建照片）':PH_STATE==='fail'?'（連不上雲端，先顯示內建照片）':''}`;
  const yearOf=p=>p.sample? '' : p.taken? String(new Date(p.taken).getFullYear()) : '?';
  const perYear={}; list.forEach(p=>{ const y=yearOf(p); perYear[y]=(perYear[y]||0)+1; });
  let year=null;
  list.forEach(p=>{
    const y=yearOf(p);
    if(y && y!==year){ year=y; g.appendChild(h(`<div class="month year">${y==='?'?'拍攝日期不明':y+' 年'}<span>${perYear[y]} 張</span></div>`)); }
    const un=isOpen(p), isNew=un&&!S.seen.includes(p.id)&&(isRecent(p)||S.unlocked.includes(p.id));
    const el=h(`<button class="photo${un?'':' locked'}" aria-label="${un?esc(p.cap||'阿布的照片'):'未解鎖照片'}">${pimg(p,400,'alt="" loading="lazy"')}${un?((isNew?'<span class="new">NEW</span>':'')+(p.by?`<span class="who">${esc(p.by)}</span>`:'')):`<span class="lock"><svg><use href="#i-lock"/></svg>${UNLOCK_COST} 片餅乾</span>`}</button>`);
    el.onclick=()=>{ if(el._lp){ el._lp=false; return; } un? view(p): unlock(p); };
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
  m=modal(`${pimg(p,1600,`class="big-photo" alt="${esc(p.cap||'阿布')}"`)}
    ${cap?`<p class="vcap">${cap}</p>`:''}${date?`<span class="meta">${date}</span>`:''}
    <button class="btn" data-close>關閉</button>
    ${API_URL&&!p.sample?'<button class="linkbtn del" id="delPhoto">刪除這張照片</button>':''}`,()=>go(back,true));
  const del=m.el.querySelector('#delPhoto');
  if(del) del.onclick=()=>{ m.el.remove(); deleteDialog(p,()=>go(back,true)); };
}
function deleteDialog(p,done){ photoMenu(p,done); const all=document.querySelectorAll('.overlay'); const b=all[all.length-1]&&all[all.length-1].querySelector('#delPhoto'); if(b) b.click(); }
function photoMenu(p,done){
  const cur=p.cat||'';
  const opts=[['','相簿'],['美食','美食'],['洗澡','洗澡'],['上廁所','上廁所']];
  const m=modal(`${pimg(p,400,'class="del-thumb" alt=""')}<h3>這張照片</h3>
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
function unlock(p){
  if(S.bones<UNLOCK_COST){ sfx.bad(); toast(`還差 ${UNLOCK_COST-S.bones} 片餅乾，去玩小遊戲吧`); return; }
  const m=modal(`<h3>解鎖這張回憶？</h3><p>用 ${UNLOCK_COST} 片餅乾，你現在有 ${S.bones} 片。</p><div class="row"><button class="btn" id="yes">解鎖</button><button class="btn ghost" data-close>先不要</button></div>`);
  m.el.querySelector('#yes').onclick=()=>{ m.el.remove(); addBones(-UNLOCK_COST); S.unlocked.push(p.id); save(); sfx.win(); bark(1); view(p); };
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
function uploadDialog(){
  if(!API_URL){ toast('還沒接上雲端硬碟：請先在 config.js 填入 API 網址'); return; }
  const back=current;
  const m=modal(`<h3>上傳阿布的照片</h3>
    <p class="meta">選照片就好，不用分類也不用寫字：AI 會看照片，美食、洗澡、上廁所的放進「日常」，其他的放相簿，還會幫每張寫一句回憶。</p>
    ${whoField('upBy','例：媽媽、小明')}
    <label class="picker drop"><svg><use href="#i-album"/></svg><b>選照片</b><span>可以一次選很多張</span><input type="file" id="upFiles" accept="image/*" multiple></label>
    <div class="uplist" id="uplist"></div>
    <div class="row"><button class="btn" id="upGo" disabled>上傳</button><button class="btn ghost" data-close>取消</button></div>`,()=>go(back,true));
  const el=m.el, listEl=el.querySelector('#uplist'), goBtn=el.querySelector('#upGo');
  bindWho(el);
  let rows=[];
  el.querySelector('#upFiles').onchange=e=>{
    const files=[...e.target.files].slice(0,20);
    if(e.target.files.length>20) toast('一次最多 20 張，先傳前 20 張');
    rows.forEach(r=>URL.revokeObjectURL(r.prev));
    listEl.innerHTML=''; rows=files.map(f=>{
      const prev=URL.createObjectURL(f);
      const row=h(`<div class="uprow"><img src="${prev}" alt=""><span class="upname">${esc(f.name||'照片')}</span><span class="st"></span></div>`);
      listEl.appendChild(row); return {f,prev,row};
    });
    goBtn.disabled=!rows.length; goBtn.textContent=`上傳 ${rows.length} 張`;
    const pk=el.querySelector('.picker b'); if(pk) pk.textContent=rows.length?`已選 ${rows.length} 張（重選）`:'選照片';
  };
  goBtn.onclick=async()=>{
    const by=el.querySelector('#upBy').value.trim(); if(by){ S.me=by; save(); }
    goBtn.disabled=true; el.dataset.busy='1';
    let ok=0; const count={'':0,'美食':0,'洗澡':0,'上廁所':0};
    for(let i=0;i<rows.length;i++){
      const r=rows[i], st=r.row.querySelector('.st');
      goBtn.textContent=`上傳中 ${i+1} / ${rows.length}`; st.textContent='…'; st.className='st';
      try{
        const [data,taken]=await Promise.all([compress(r.f),takenTime(r.f)]);
        const j=await api({action:'upload',data,taken,mime:'image/jpeg',name:(r.f.name||'abu.jpg').replace(/\.\w+$/,'')+'.jpg',by});
        const p=j.photo; PH.push(p); S.unlocked.push(p.id); ok++; count[p.cat||'']=(count[p.cat||'']||0)+1;
        st.textContent=CAT_LABEL[p.cat||'']; st.className='st cat cat-'+(p.cat||'mem');
      }catch(e){ st.textContent='!'; st.className='st err'; st.title=e.message; }
    }
    save(); lsSet('abu-photos',{photos:PH,config:CONFIG}); PH_STATE='ok';
    delete el.dataset.busy;
    if(ok){ addBones(ok); sfx.win(); bark(2); }
    const parts=[count['']&&`${count['']} 張放進相簿`,count['美食']&&`${count['美食']} 張美食`,count['洗澡']&&`${count['洗澡']} 張洗澡`,count['上廁所']&&`${count['上廁所']} 張上廁所`].filter(Boolean).join('、');
    toast(ok===rows.length? `上傳完成！${parts}。送你 ${ok} 片餅乾`: `成功 ${ok} 張（${parts}），${rows.length-ok} 張失敗，標 ! 的可以再試一次`,3200);
    rows=rows.filter(r=>r.row.querySelector('.st').classList.contains('err'));
    goBtn.textContent=rows.length?`重試 ${rows.length} 張`:'完成';
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
      <div class="dgrid">${photos.length? photos.map(p=>`<div class="dthumb" data-id="${esc(p.id)}">${pimg(p,300,`alt="${esc(p.cap||c.cat)}" loading="lazy"`)}</div>`).join('') : '<p class="meta">還沒有照片</p>'}</div></section>`));
  });
  main.appendChild(s);
  if(API_URL) s.querySelectorAll('.dthumb').forEach(d=>{ const p=pool().find(x=>x.id===d.dataset.id); if(p&&!p.sample) longPress(d,()=>photoMenu(p,()=>go('food',true))); });
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
    if(round>=ROUNDS){ setTimeout(()=>winDialog({title:`裝了 ${ROUNDS} 份飯`,text:`最後一份：${title}${text}`,bones:total,faceKey:face_,again:()=>go('bowl')}),700); return; }
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
      winDialog({title: right===N?'全部答對！':`答對 ${right} / ${N} 題`, text: right===N?'你是阿布最放心的家人。':'多玩幾次，阿布的安全就靠你了。', bones, faceKey: right>=6?'face_66':'face_60', again:()=>go('quiz')});
    };
  });
  show();
}

/* ---------------- 啟動 ---------------- */
renderTop(); go('home'); loadPhotos(false);
