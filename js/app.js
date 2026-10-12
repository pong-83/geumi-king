import { db } from './db.js';
import { pygmySVG, pixelIcon } from './sprite.js';

/* ───────────────────────── 기본 도구 ───────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
const weekStart = (s) => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); };
const monthKey = (s) => s.slice(0, 7);
const monthDays = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const fmtDate = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? null : +v);

/* ───────────────────────── 설정 ───────────────────────── */
const SKEY = 'pg.settings';
const defaults = { workerUrl: '', appKey: '', maxVideoMB: 5, pets: [], petId: '' };
let S = load();
function load() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return { ...defaults }; }
}
function saveSettings() { localStorage.setItem(SKEY, JSON.stringify(S)); }
const pet = () => S.pets.find((p) => p.id === S.petId) || S.pets[0] || null;

function birthOf(p) {
  if (!p) return null;
  if (p.birth) return p.birth;
  if (p.adopt) return addDays(p.adopt, -7 * (num(p.adoptWeeks) ?? 3));
  return null;
}
function weeksOld(p, date = today()) {
  const b = birthOf(p);
  return b ? Math.floor(diffDays(date, b) / 7) : null;
}

/* ───────────────────────── 케어시트 (암호화) ───────────────────────── */
let CARE = null;
try { CARE = JSON.parse(localStorage.getItem('pg.care') || 'null'); } catch { CARE = null; }
const G = () => CARE?.guide || null;

async function unlockCare(key) {
  const enc = await (await fetch('data/caresheet.enc.json', { cache: 'no-cache' })).json();
  const u = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: u(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u(enc.iv) }, k, u(enc.data));
  CARE = JSON.parse(new TextDecoder().decode(plain));
  localStorage.setItem('pg.care', JSON.stringify(CARE));
  return CARE;
}

function stageFor(w) {
  const g = G();
  if (!g || w == null) return null;
  return g.stages.find((s) => w <= s.maxWeek) || g.stages.at(-1);
}
function tempFor(w) {
  const g = G();
  if (!g || w == null) return null;
  return g.temp.find((t) => w <= t.maxWeek) || g.temp.at(-1);
}
const WATER_DAYS = () => G()?.waterDays || [3, 4];
const FEED_DAYS = () => G()?.feedResetDays || 3;
const PHOTO_DAYS = () => G()?.photoEveryDays || 2;
const FRUITS = () => G()?.fruits?.ok || ['사과', '바나나', '블루베리', '딸기'];
const CLEAN = ['똥 치우기', '베딩 부분 교체', '베딩 전체 교체', '밥그릇 세척', '급수기 세척', '소저 세척', '케이지 닦기'];
const WORMS = ['왁스웜', '밀웜', '슈퍼밀웜'];
const CONDS = [['좋음', '활발 · 윤기 · 통통'], ['보통', '평소 같아요'], ['주의', '기운 없음 · 걱정']];

/* ───────────────────────── 기록 데이터 ───────────────────────── */
const E = new Map(); // id → entry
const entryId = (date, petId) => `${date}_${petId}`;
const retroId = (mk, petId) => `retro_${mk}_${petId}`;

function blankEntry(date, p = pet()) {
  return {
    id: entryId(date, p.id), kind: '일지', date, pet: p.name, petId: p.id,
    milpro: null, fruchu: null, worm: null, wormType: '왁스웜', iks: null, iksNew: false,
    fruit: null, fruitKinds: [], supp: [], water: false, honey: false, feedReset: false,
    weight: null, temp: null, humid: null, clean: [], handling: null, condition: '', memo: '',
  };
}
const getEntry = (date, p = pet()) => E.get(entryId(date, p.id)) || blankEntry(date, p);
const petEntries = (p = pet()) => [...E.values()].filter((e) => e.kind === '일지' && e.petId === p?.id).sort((a, b) => (a.date < b.date ? 1 : -1));

function isEmpty(e) {
  return !(e.milpro || e.fruchu || e.worm || e.iks || e.iksNew || e.fruit || e.supp?.length || e.water || e.honey || e.feedReset
    || e.weight || e.temp || e.humid || e.clean?.length || e.handling || e.condition || e.memo || mediaFor(e.id).length);
}
const hasFood = (e) => !!(e.milpro || e.fruchu || e.worm || e.iks || e.fruit);

async function putEntry(e, { sync = true } = {}) {
  e.updatedAt = Date.now();
  e.dirty = true;
  e.title = e.kind === '회고' ? `${e.date.slice(0, 7)} 회고 · ${e.pet}` : `${fmtDate(e.date)} · ${e.pet}`;
  E.set(e.id, e);
  await db.put('entries', e);
  if (sync) scheduleSync();
}

/* ───────────────────────── 미디어 ───────────────────────── */
const M = new Map(); // id → media (thumb, view, blob)
const mediaFor = (entryId) => [...M.values()].filter((m) => m.entryId === entryId);

async function imageToJpeg(file, max, q) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src = bmp;
  if (!bmp) {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  w = src.width; h = src.height;
  const r = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r); c.height = Math.round(h * r);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
}

async function videoPoster(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    v.src = URL.createObjectURL(file);
    const done = (b) => { URL.revokeObjectURL(v.src); resolve(b); };
    v.onloadeddata = () => { v.currentTime = Math.min(0.2, v.duration || 0); };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      const r = Math.min(1, 360 / Math.max(v.videoWidth, v.videoHeight));
      c.width = v.videoWidth * r; c.height = v.videoHeight * r;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(done, 'image/jpeg', 0.7);
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
  });
}

async function addMedia(files, entry, tag = '') {
  let added = 0;
  for (const f of files) {
    const isVideo = f.type.startsWith('video/');
    if (isVideo && f.size > S.maxVideoMB * 1024 * 1024) {
      toast(`영상은 ${S.maxVideoMB}MB까지 올릴 수 있어요 (${(f.size / 1048576).toFixed(1)}MB)`);
      continue;
    }
    const m = { id: uid(), entryId: entry.id, date: entry.date, petId: entry.petId, type: isVideo ? 'video' : 'image', tag, createdAt: Date.now(), status: 'pending' };
    if (isVideo) {
      m.blob = f; m.mime = f.type || 'video/mp4'; m.name = f.name || `video-${m.id}.mp4`;
      m.thumb = await videoPoster(f);
    } else {
      m.blob = await imageToJpeg(f, 1600, 0.82);
      m.view = m.blob;
      m.thumb = await imageToJpeg(f, 360, 0.7);
      m.mime = 'image/jpeg'; m.name = `pygmy-${entry.date}-${m.id}.jpg`;
    }
    M.set(m.id, m); await db.put('media', m); added++;
  }
  if (added) {
    const e = E.get(entry.id) || entry;
    await putEntry(e);
  }
  return added;
}

/* ───────────────────────── 노션 동기화 ───────────────────────── */
const connected = () => !!(S.workerUrl && S.appKey);
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const url = S.workerUrl.replace(/\/$/, '') + path;
  const isRaw = body instanceof Blob;
  const res = await fetch(url, {
    method,
    headers: { 'X-App-Key': S.appKey, ...(body && !isRaw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: isRaw ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let syncTimer, syncing = false;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 1200); renderSync(); }

function renderSync(state) {
  const el = $('#syncState');
  if (!connected()) { el.className = 'sync'; el.textContent = '로컬 저장'; return; }
  const dirty = [...E.values()].some((e) => e.dirty) || [...M.values()].some((m) => m.status !== 'synced');
  if (state === 'err') { el.className = 'sync err'; el.textContent = '동기화 실패'; return; }
  if (syncing) { el.className = 'sync pending'; el.textContent = '노션 저장 중'; return; }
  el.className = dirty ? 'sync pending' : 'sync ok';
  el.textContent = dirty ? '대기 중' : '노션 저장됨';
}

function payload(e) {
  const { dirty, updatedAt, pageId, editedAt, ...rest } = e;
  return rest;
}

async function syncPush() {
  if (!connected() || syncing || !navigator.onLine) { renderSync(); return; }
  syncing = true; renderSync();
  try {
    for (const e of [...E.values()].filter((x) => x.dirty)) {
      const stamp = e.updatedAt;
      const r = await api('/entry', { method: 'POST', body: payload(e) });
      const cur = E.get(e.id);
      cur.pageId = r.pageId;
      if (cur.updatedAt === stamp) cur.dirty = false;
      await db.put('entries', cur);
    }
    for (const m of [...M.values()].filter((x) => x.status !== 'synced')) {
      const e = E.get(m.entryId);
      if (!e || !m.blob) continue;
      try {
        const r = await api('/media', {
          method: 'POST', body: m.blob,
          headers: { 'Content-Type': m.mime, 'X-Filename': encodeURIComponent(m.name), 'X-Entry': encodeURIComponent(JSON.stringify(payload(e))) },
        });
        m.status = 'synced'; m.blockId = r.blockId;
        if (m.type === 'video') delete m.blob; // 영상 원본은 노션에만 두고 폰 용량을 아껴요
        else delete m.blob;
      } catch (err) {
        m.status = 'error'; m.error = err.message;
        toast(`사진 업로드 실패: ${err.message}`);
      }
      await db.put('media', m);
    }
    syncing = false; renderSync();
  } catch (err) {
    syncing = false; renderSync('err');
    console.warn(err);
    toast(`노션 저장 실패: ${err.message}`);
  }
}

async function syncPull() {
  const from = addDays(today(), -800);
  const r = await api(`/entries?from=${from}`);
  let n = 0;
  for (const remote of r.entries) {
    const local = E.get(remote.id);
    if (local?.dirty) continue;
    const p = S.pets.find((x) => x.name === remote.pet);
    const e = { ...(local || {}), ...remote, petId: p?.id || local?.petId || remote.id.split('_').at(-1), dirty: false };
    for (const k of ['fruitKinds', 'supp', 'clean']) e[k] = e[k] || [];
    E.set(e.id, e); await db.put('entries', e); n++;
  }
  return n;
}

/* ───────────────────────── 화면 효과 ───────────────────────── */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

function burst(x, y, { count = 16, colors = ['#b48b63', '#f5e98e', '#b9cdf5', '#4b3b31'] } = {}) {
  const layer = $('#fx');
  for (let i = 0; i < count; i++) {
    const b = document.createElement('i');
    b.className = 'fx-bit';
    b.style.background = colors[i % colors.length];
    b.style.left = x + 'px'; b.style.top = y + 'px';
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const d = 50 + Math.random() * 70;
    layer.appendChild(b);
    b.animate([
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 30}px)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(a) * d * 1.1}px, ${Math.sin(a) * d + 60}px)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => b.remove();
  }
}
function hearts(x, y, n = 4) {
  const layer = $('#fx');
  for (let i = 0; i < n; i++) {
    const hEl = document.createElement('div');
    hEl.className = 'fx-heart';
    hEl.innerHTML = pixelIcon('heart', 18);
    hEl.style.left = x - 9 + (Math.random() * 40 - 20) + 'px'; hEl.style.top = y + 'px';
    layer.appendChild(hEl);
    hEl.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translateY(-${70 + Math.random() * 40}px) scale(1)`, opacity: 0 }],
      { duration: 1100, delay: i * 120, easing: 'ease-out', fill: 'both' }).onfinish = () => hEl.remove();
  }
}
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

/* ───────────────────────── 시트(모달) ───────────────────────── */
function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = html; sh.hidden = false; $('#sheetBackdrop').hidden = false;
  onMount?.(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; $('#sheet').innerHTML = ''; }

/* ───────────────────────── 탭 아이콘 ───────────────────────── */
const TAB_ICONS = {
  today: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><rect class="fill" x="5" y="11" width="14" height="9" fill="none"/><path d="M4 11 12 4l8 7M6 10v10h12V10" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10" y="14" width="4" height="6" fill="currentColor"/></svg>',
  log: '<svg viewBox="0 0 24 24"><rect class="fill" x="5" y="4" width="14" height="17" rx="2" fill="none"/><rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8"/></svg>',
  album: '<svg viewBox="0 0 24 24"><rect class="fill" x="3.5" y="5" width="17" height="14" rx="2" fill="none"/><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 17 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="8" width="3" height="3" fill="currentColor"/></svg>',
  month: '<svg viewBox="0 0 24 24"><rect class="fill" x="3.5" y="5" width="17" height="15" rx="2" fill="none"/><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8"/><rect x="7" y="13" width="3" height="3" fill="currentColor"/></svg>',
  care: '<svg viewBox="0 0 24 24"><rect class="fill" x="5" y="3.5" width="14" height="17" fill="none"/><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 17a3 3 0 0 1 3-3h11" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};

/* ───────────────────────── 라우터 ───────────────────────── */
const routes = { today: viewToday, log: viewLog, album: viewAlbum, month: viewMonth, care: viewCare };
let routeState = { logDate: today(), month: monthKey(today()), q: '' };

function route() {
  const [, name = 'today', arg] = location.hash.split('/');
  const fn = routes[name] || viewToday;
  $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (routes[name] ? name : 'today')));
  if (name === 'log' && arg) routeState.logDate = arg;
  if (!pet()) { $('#view').innerHTML = onboardingHTML(); bindOnboarding(); return; }
  fn($('#view'));
  window.scrollTo({ top: 0 });
}

/* ───────────────────────── 첫 실행 ───────────────────────── */
function petFormHTML(p = {}) {
  return `
    <div class="form">
      <label>이름</label><input type="text" name="name" value="${esc(p.name || '')}" placeholder="예: 콩이" required>
      <label>입양일</label><input type="date" name="adopt" value="${esc(p.adopt || '')}">
      <label>입양 당시 주차 <span class="muted small">(생일을 모르면 이걸로 나이를 계산해요)</span></label>
      <input type="number" name="adoptWeeks" min="0" max="60" value="${esc(p.adoptWeeks ?? 3)}">
      <label>생일 <span class="muted small">(알면 입력, 주차보다 우선)</span></label><input type="date" name="birth" value="${esc(p.birth || '')}">
      <label>성별</label>
      <select name="sex">${['', '암컷', '수컷', '모름'].map((s) => `<option ${p.sex === s ? 'selected' : ''} value="${s}">${s || '선택 안 함'}</option>`).join('')}</select>
      <label>본방 이동일 <span class="muted small">(분양보증 11개월 계산용)</span></label><input type="date" name="mainRoom" value="${esc(p.mainRoom || '')}">
    </div>`;
}
function readPetForm(root, base = {}) {
  const v = (n) => $(`[name=${n}]`, root).value.trim();
  return { ...base, id: base.id || uid(), name: v('name') || '피그미', adopt: v('adopt'), adoptWeeks: num(v('adoptWeeks')) ?? 3, birth: v('birth'), sex: v('sex'), mainRoom: v('mainRoom') };
}
function onboardingHTML() {
  return `
    <div class="hero" style="margin-top:14px">
      <div class="bubble">안녕! 나랑 같이 기록 시작할래?</div>
      <div class="stage"><div style="padding-bottom:16px">${pygmySVG({ size: 132 })}</div></div>
      <div class="ground"></div>
    </div>
    <p class="eyebrow">처음 설정</p>
    <h1 class="title">우리 아이를<br><span class="thin">알려 주세요</span></h1>
    <div class="card" id="onb">${petFormHTML({ adopt: today() })}
      <button class="btn primary block" style="margin-top:16px" id="onbSave">시작하기</button>
    </div>`;
}
function bindOnboarding() {
  $('#onbSave').onclick = () => {
    const p = readPetForm($('#onb'));
    S.pets.push(p); S.petId = p.id; saveSettings(); renderTop();
    location.hash = '#/today'; route();
    setTimeout(() => { const s = $('.hero .px-pygmy'); if (s) { const [x, y] = center(s); hearts(x, y, 6); } }, 200);
  };
}

/* ───────────────────────── 오늘 ───────────────────────── */
const DAY_TIPS = [
  '낮에는 쿨쿨 자는 시간이에요. 피그미는 야행성이라 밤에 놀아요.',
  '손동굴은 몸 전체가 감싸져서 360도 방어막처럼 편안해요.',
  '온도가 습도보다 먼저예요. 케이지 안 온도계를 확인해요.',
  '팔이나 어깨로 오르면 탈출 각을 재는 중이에요. 손바닥에서만!',
  '딱딱 소리가 나면 핸들링을 멈추고 넣어 줘요.',
  '몸무게보다 활력, 털 윤기, 몸매로 건강을 봐요.',
];
function tipList() {
  const t = [...DAY_TIPS];
  if (CARE) CARE.sections.forEach((s) => s.items.forEach((i) => { if (i.t.length < 70) t.push(i.t); }));
  return t;
}

function lastDate(pred, p = pet()) {
  const t = today();
  const e = petEntries(p).find((x) => x.date <= t && pred(x));
  return e?.date || null;
}
function countSince(pred, from, p = pet()) {
  const t = today();
  return petEntries(p).filter((x) => x.date >= from && x.date <= t && pred(x)).length;
}

function remindersFor(p) {
  const t = today();
  const w = weeksOld(p);
  const st = stageFor(w);
  const out = [];
  // 적응기간
  const adaptN = G()?.adaptDays || 3;
  if (p.adopt && diffDays(t, p.adopt) < adaptN && diffDays(t, p.adopt) >= 0) {
    const start = addDays(p.adopt, adaptN);
    out.push({ lv: 'bad', ico: '✋', h: '적응기간이라 핸들링은 쉬어요', s: `${fmtDate(start)}부터 핸들링해요. 인증 사진은 케이지 밖에서 찍어요.` });
  }
  // 물
  const [wMin, wMax] = WATER_DAYS();
  const lw = lastDate((e) => e.water);
  if (!lw) out.push({ lv: 'warn', ico: '💧', h: '물 교체 기록이 아직 없어요', s: `급수기 물은 ${wMin}~${wMax}일마다 갈아요.` });
  else {
    const d = diffDays(t, lw);
    if (d >= wMax) out.push({ lv: 'bad', ico: '💧', h: `물 갈 때가 지났어요 (D+${d})`, s: `마지막 교체 ${fmtDate(lw)}` });
    else if (d >= wMin) out.push({ lv: 'warn', ico: '💧', h: `오늘 물 갈아 주세요 (D+${d})`, s: `${wMin}~${wMax}일마다 교체해요.` });
    else out.push({ lv: 'good', ico: '💧', h: `물 교체 D+${d}`, s: `다음 교체 ${fmtDate(addDays(lw, wMin))}` });
  }
  // 사료 전체 교체
  const lf = lastDate((e) => e.feedReset);
  const fd = FEED_DAYS();
  if (lf && diffDays(t, lf) >= fd) out.push({ lv: 'warn', ico: '🥣', h: `사료 전체 교체할 날이에요`, s: `${fd}일이 지나면 남은 사료까지 모두 갈아요. 마지막 ${fmtDate(lf)}` });
  else if (!lf) out.push({ lv: '', ico: '🥣', h: '사료 전체 교체도 체크해 두면 알려 드려요', s: `${fd}일마다 남은 사료까지 모두 교체해요.` });
  // 이번 주 과일 · 웜 · 영양제
  const ws = weekStart(t);
  if (st) {
    if (st.fruitPerWeek >= 7) {
      const todayFruit = getEntry(t, p).fruit;
      out.push({ lv: todayFruit ? 'good' : 'warn', ico: '🍎', h: todayFruit ? '오늘 과일 큐브 완료' : '오늘 과일 1cm 큐브를 줘요', s: `${st.label}는 매일 1조각이에요.` });
    } else {
      const n = countSince((e) => e.fruit > 0, ws, p);
      out.push({ lv: n >= st.fruitPerWeek ? 'good' : '', ico: '🍎', h: `이번 주 과일 ${n}/${st.fruitPerWeek}회`, s: '1cm 큐브, 남은 과일은 다음날 교체' });
    }
    if (st.wormPerWeek) {
      const n = countSince((e) => e.worm > 0, ws, p);
      out.push({ lv: n >= st.wormPerWeek ? 'good' : '', ico: '🐛', h: `이번 주 웜 ${n}/${st.wormPerWeek}회`, s: st.worm });
    }
  }
  const supps = G()?.supplements || [{ name: '칼슘', perWeek: 1 }, { name: '비타민', perWeek: 1 }];
  const missing = supps.filter((s) => countSince((e) => e.supp?.includes(s.name), ws, p) < s.perWeek).map((s) => s.name);
  out.push(missing.length
    ? { lv: '', ico: '💊', h: `이번 주 ${missing.join(' · ')} 남았어요`, s: '영양제는 주 1회씩 따로 줘요.' }
    : { lv: 'good', ico: '💊', h: '이번 주 영양제 완료', s: '칼슘 · 비타민 모두 챙겼어요.' });
  // 사진 인증
  const lastPhoto = [...M.values()].filter((m) => m.petId === p.id).map((m) => m.date).sort().at(-1);
  const pd = PHOTO_DAYS();
  if (!lastPhoto || diffDays(t, lastPhoto) >= pd) {
    out.push({ lv: 'warn', ico: '📷', h: '사진 인증할 날이에요', s: lastPhoto ? `마지막 사진 ${fmtDate(lastPhoto)}` : `${pd}일에 한 번 사진으로 상태를 남겨요.` });
  }
  // 분양보증
  if (p.mainRoom) {
    const months = G()?.warrantyMonths || 11;
    const end = (() => { const d = parse(p.mainRoom); d.setMonth(d.getMonth() + months); return ymd(d); })();
    if (t <= end) {
      const r = E.get(retroId(monthKey(t), p.id));
      const left = diffDays(end, t);
      out.push({ lv: r?.capture ? 'good' : 'warn', ico: '🛡️', h: r?.capture ? '이번 달 보증 캡처 완료' : '이번 달 본방 캡처를 남겨요', s: `보증 기간 D-${left} · ${fmtDate(end)}까지`, capture: !r?.capture });
    }
  }
  return out;
}

function viewToday(root) {
  const p = pet();
  const t = today();
  const w = weeksOld(p);
  const st = stageFor(w);
  const tr = tempFor(w);
  const hour = new Date().getHours();
  const sleeping = hour >= 7 && hour < 19;
  const e = getEntry(t, p);
  const streakDays = [...Array(14)].map((_, i) => addDays(t, i - 13)).map((d) => !isEmpty(getEntry(d, p)));
  let streak = 0;
  for (let i = 13; i >= 0; i--) { if (streakDays[i]) streak++; else if (i === 13) continue; else break; }
  const tips = tipList();
  const rem = remindersFor(p);

  root.innerHTML = `
    <div class="hero">
      <div class="bubble" id="bubble">${sleeping ? '쿨쿨… 낮에는 자는 시간이에요. 톡 건드리면 깰지도?' : `${esc(p.name)} 깨어 있어요! 오늘 기록 남겨 줄래요?`}</div>
      <div class="stage">
        <button class="pygmy-btn" id="pygmy" aria-label="${esc(p.name)} 쓰다듬기">${pygmySVG({ size: 128, mood: sleeping ? 'sleep' : 'idle' })}</button>
        <div class="stats">
          <div class="muted">${w != null ? '생후' : ''}</div>
          <div class="big">${w != null ? `${w}<span style="font-size:15px">주</span>` : '-'}</div>
          <div class="muted">${p.adopt ? `함께한 지 ${diffDays(t, p.adopt) + 1}일` : ''}</div>
        </div>
      </div>
      <div class="ground"></div>
    </div>

    <p class="eyebrow">${fmtDate(t)}</p>
    <h1 class="title">${esc(p.name)}의 오늘<br><span class="thin">${isEmpty(e) ? '아직 기록이 없어요' : '기록하는 중이에요'}</span></h1>
    <div class="row" style="margin:10px 0 4px">
      <a class="btn primary grow" href="#/log/${t}">오늘 기록하기</a>
      <button class="btn ghost" id="quickWater">${pixelIcon('drop', 16)} 물 갈았어요</button>
    </div>
    <div class="streak" aria-label="최근 14일 기록">${streakDays.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row between small muted" style="margin-top:4px"><span>최근 14일</span><span class="pixel">${streak}일 연속</span></div>

    ${st ? `
    <p class="eyebrow">${st.label} 식단 가이드 (하루 급여 개수)</p>
    <div class="card blue">
      <div class="guide-grid">
        <div><span class="n">${st.milpro}</span><span class="l">밀프로</span></div>
        <div><span class="n">${st.fruchu}</span><span class="l">후르츄</span></div>
        <div><span class="n">${st.iks}</span><span class="l">익스</span></div>
        <div><span class="n">${st.fruitPerWeek >= 7 ? '매일' : `주${st.fruitPerWeek}`}</span><span class="l">과일 1cm</span></div>
      </div>
      ${st.worm ? `<p class="small" style="margin:10px 0 0">+ 주 ${st.wormPerWeek}회 ${esc(st.worm)}</p>` : ''}
      ${tr ? `<p class="small" style="margin:6px 0 0">케이지 안 온도 <b>${tr.min}~${tr.max}°C</b> · 습도 <b>${G().humid.min}~${G().humid.max}%</b></p>` : ''}
    </div>` : `
    <div class="card yellow small">${CARE ? '나이를 알 수 없어서 가이드를 못 보여 드려요. 설정에서 입양일이나 생일을 넣어 주세요.' : '설정에서 앱 키를 넣으면 케어시트와 주차별 식단 가이드가 열려요.'}</div>`}

    <p class="eyebrow">챙길 것</p>
    <div class="card">
      ${rem.map((r, i) => `
        <div class="todo">
          <div class="ico ${r.lv}">${r.ico}</div>
          <div class="grow"><b>${esc(r.h)}</b><span>${esc(r.s)}</span></div>
          ${r.capture ? `<button class="btn sm" data-capture="${i}">캡처함</button>` : ''}
        </div>`).join('')}
    </div>
  `;

  const btn = $('#pygmy');
  let tipI = Math.floor(Math.random() * tips.length);
  btn.onclick = () => {
    const svg = $('.px-pygmy', btn);
    svg.classList.remove('hop', 'wiggle'); void svg.getBoundingClientRect();
    if (svg.classList.contains('mood-sleep')) {
      btn.innerHTML = pygmySVG({ size: 128, mood: 'idle', cls: 'wiggle' });
      $('#bubble').textContent = '…응? 깼다! ' + tips[tipI++ % tips.length];
    } else {
      svg.classList.add('hop');
      $('#bubble').textContent = tips[tipI++ % tips.length];
    }
    const [x, y] = center(btn); hearts(x, y - 30, 3);
  };
  $('#quickWater').onclick = async (ev) => {
    const [x, y] = center(ev.currentTarget);
    const cur = getEntry(t, p);
    cur.water = true; await putEntry(cur);
    burst(x, y, { colors: ['#b9cdf5', '#2f4e9a', '#ffffff', '#dfe8fb'] });
    toast('물 교체 기록했어요');
    setTimeout(() => viewToday(root), 700);
  };
  $$('[data-capture]').forEach((b) => b.onclick = async () => {
    const [x, y] = center(b);
    const mk = monthKey(t);
    const r = E.get(retroId(mk, p.id)) || { id: retroId(mk, p.id), kind: '회고', date: `${mk}-01`, pet: p.name, petId: p.id, memo: '', capture: false };
    r.capture = true; await putEntry(r);
    burst(x, y);
    toast('이번 달 보증 캡처 체크!');
    setTimeout(() => viewToday(root), 600);
  });
}

/* ───────────────────────── 기록 ───────────────────────── */
function stepper(name, val, { step = 1, max = 999 } = {}) {
  return `<div class="stepper" data-step="${step}" data-max="${max}">
    <button type="button" data-d="-1" aria-label="빼기">−</button>
    <input inputmode="decimal" type="number" name="${name}" value="${val ?? ''}" placeholder="0" min="0" step="${step}">
    <button type="button" data-d="1" aria-label="더하기">+</button></div>`;
}
function toggle(name, on) { return `<span class="toggle"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span>`; }
function chips(name, options, sel = [], { single = false, cls = '' } = {}) {
  return `<div class="chips" data-chips="${name}" data-single="${single ? 1 : 0}">${options.map((o) => `<button type="button" class="chip ${cls} ${sel.includes(o) ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}
function condFace(kind) {
  const m = { 좋음: 'idle', 보통: 'idle', 주의: 'sleep' }[kind];
  return `<span class="face">${pygmySVG({ size: 34, mood: m })}</span>`;
}

function viewLog(root) {
  const p = pet();
  const date = routeState.logDate;
  const e = structuredClone(getEntry(date, p));
  const w = weeksOld(p, date);
  const st = stageFor(w);
  const tr = tempFor(w);
  const prevW = petEntries(p).find((x) => x.date < date && x.weight)?.weight;
  const ws = weekStart(date);
  const strip = [...Array(7)].map((_, i) => addDays(ws, i));
  const adaptN = G()?.adaptDays || 3;
  const adapting = p.adopt && diffDays(date, p.adopt) >= 0 && diffDays(date, p.adopt) < adaptN;
  const fruits = [...new Set([...FRUITS(), ...(e.fruitKinds || [])])];

  root.innerHTML = `
    <div class="datebar">
      <button class="icon-btn" id="prevDay" aria-label="전날">‹</button>
      <input type="date" id="logDate" value="${date}" max="${addDays(today(), 1)}">
      <button class="icon-btn" id="nextDay" aria-label="다음날">›</button>
    </div>
    <div class="daystrip">${strip.map((d) => `<button data-d="${d}" class="${d === date ? 'on' : ''} ${!isEmpty(getEntry(d, p)) ? 'has' : ''}">${DOW[parse(d).getDay()]}<b>${parse(d).getDate()}</b></button>`).join('')}</div>
    <p class="eyebrow">${w != null ? `생후 ${w}주 · ` : ''}${st ? st.label : '기록'} · 자동 저장돼요</p>

    <form id="logForm" autocomplete="off" onsubmit="return false">
    <section class="card">
      <div class="card-head"><h2 class="sec">식단</h2>${st ? '<button type="button" class="btn sm blue" id="fillGuide">가이드대로 채우기</button>' : ''}</div>
      <div class="field"><label>밀프로<span class="sub">${st ? `가이드 ${st.milpro}개` : '개수'}</span></label>${stepper('milpro', e.milpro)}</div>
      <div class="field"><label>후르츄 (과일사료)<span class="sub">${st ? `가이드 ${st.fruchu}개` : '개수'}</span></label>${stepper('fruchu', e.fruchu)}</div>
      <div class="field"><label>${esc(e.wormType || '왁스웜')}<span class="sub">${st?.worm ? `주 ${st.wormPerWeek}회 · ${esc(st.worm)}` : '마리'}</span></label>${stepper('worm', e.worm)}</div>
      <div style="padding:0 0 10px">${chips('wormType', WORMS, [e.wormType || '왁스웜'], { single: true, cls: 'blue' })}</div>
      <div class="field"><label>익스 넣어준 양<span class="sub">먹은 양이 아니라 넣어준 개수 (반 개 = 0.5)</span></label>${stepper('iks', e.iks, { step: 0.5 })}</div>
      <div class="field"><label>익스 새로 교체<span class="sub">똥이 묻거나 물러져서 갈았어요</span></label>${toggle('iksNew', e.iksNew)}</div>
      <div class="field"><label>과일 큐브<span class="sub">1cm 큐브 개수</span></label>${stepper('fruit', e.fruit)}</div>
      <div style="padding:0 0 10px">${chips('fruitKinds', fruits, e.fruitKinds)}<div class="hint bad hidden" id="fruitWarn"></div></div>
      <div class="field"><span class="lbl">영양제</span>${chips('supp', ['칼슘', '비타민'], e.supp)}</div>
      <div class="field"><label>급수기 물 교체</label>${toggle('water', e.water)}</div>
      <div class="field"><label>꿀 · 젤리 대롱 바르기</label>${toggle('honey', e.honey)}</div>
      <div class="field"><label>사료 전체 교체<span class="sub">남은 사료까지 모두 갈았어요</span></label>${toggle('feedReset', e.feedReset)}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">몸무게 · 컨디션</h2></div>
      <div class="field"><label>몸무게<span class="sub">${prevW ? `지난 기록 ${prevW}g` : '저울 사진도 같이 남겨요'}</span></label>
        <input class="numin" type="number" inputmode="decimal" step="0.1" name="weight" value="${e.weight ?? ''}" placeholder="0.0"><span class="unit">g</span></div>
      <div class="hint ok hidden" id="weightDiff"></div>
      <div style="padding:10px 0"><button type="button" class="btn sm ghost" id="weightPhoto">저울 사진 추가</button></div>
      <div class="chip-label">컨디션 (활력 · 털 윤기 · 몸매)</div>
      <div class="cond">${CONDS.map(([k, s]) => `<button type="button" data-cond="${k}" class="${e.condition === k ? 'on' : ''}">${condFace(k)}${k}<span class="sub" style="display:block;font-weight:400;font-size:10.5px;color:var(--ink-3)">${s}</span></button>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">케이지 환경</h2>${tr ? `<span class="tag blue">${tr.min}~${tr.max}°C · ${G().humid.min}~${G().humid.max}%</span>` : ''}</div>
      <div class="field"><label>케이지 안 온도</label><input class="numin" type="number" inputmode="decimal" step="0.1" name="temp" value="${e.temp ?? ''}" placeholder="0.0"><span class="unit">°C</span></div>
      <div class="hint hidden" id="tempHint"></div>
      <div class="field"><label>습도</label><input class="numin" type="number" inputmode="numeric" name="humid" value="${e.humid ?? ''}" placeholder="0"><span class="unit">%</span></div>
      <div class="hint hidden" id="humidHint"></div>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">청소</h2><span class="muted small">간단하게라도 했다면 체크</span></div>
      ${chips('clean', CLEAN, e.clean)}
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">핸들링</h2></div>
      <div class="field"><label>오늘 핸들링 횟수<span class="sub">${adapting ? '적응기간이라 쉬어요' : '1시간 간격 5~10분, 하루 5회 이상'}</span></label>${stepper('handling', e.handling)}</div>
      ${adapting ? '<div class="hint bad">입양 후 3일은 핸들링 금지예요.</div>' : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">사진 · 영상</h2><span class="muted small">영상 ${S.maxVideoMB}MB까지</span></div>
      <div class="thumbs" id="thumbs"></div>
      <input type="file" id="mediaInput" accept="image/*,video/*" multiple hidden>
    </section>

    <section class="card">
      <div class="card-head"><h2 class="sec">메모</h2></div>
      <textarea class="memo" name="memo" placeholder="오늘 있었던 일, 행동, 똥 상태…">${esc(e.memo)}</textarea>
    </section>
    </form>

    <div class="savebar"><button class="btn primary" id="saveBtn">기록 완료</button></div>
  `;

  const form = $('#logForm');
  let saveT;
  const collect = () => {
    const fd = (n) => form.elements[n];
    for (const k of ['milpro', 'fruchu', 'worm', 'iks', 'fruit', 'weight', 'temp', 'humid', 'handling']) e[k] = num(fd(k).value);
    for (const k of ['iksNew', 'water', 'honey', 'feedReset']) e[k] = fd(k).checked;
    e.memo = fd('memo').value;
    $$('[data-chips]', form).forEach((c) => {
      const vals = $$('.chip.on', c).map((b) => b.dataset.v);
      e[c.dataset.chips] = c.dataset.single === '1' ? vals[0] || '' : vals;
    });
  };
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(async () => { collect(); await putEntry(e); }, 350); hints(); };

  const hints = () => {
    const wv = num(form.elements.weight.value);
    const wd = $('#weightDiff');
    if (wv && prevW) { const d = +(wv - prevW).toFixed(1); wd.textContent = d === 0 ? '지난번과 같아요' : `지난번보다 ${d > 0 ? '+' : ''}${d}g`; wd.classList.remove('hidden'); }
    else wd.classList.add('hidden');
    const tv = num(form.elements.temp.value), th = $('#tempHint');
    if (tv != null && tr) {
      const ok = tv >= tr.min && tv <= tr.max;
      th.className = `hint ${ok ? 'ok' : 'bad'}`;
      th.textContent = ok ? '적정 온도예요' : tv < tr.min ? `낮아요. ${tr.min}~${tr.max}°C로 올려 주세요` : `높아요. 에어컨 · 선풍기로 ${tr.max}°C 아래로`;
    } else th.className = 'hint hidden';
    const hv = num(form.elements.humid.value), hh = $('#humidHint');
    const hg = G()?.humid;
    if (hv != null && hg) {
      hh.className = `hint ${hv <= hg.max ? 'ok' : 'bad'}`;
      hh.textContent = hv <= hg.max ? '좋아요' : hv <= hg.soft ? '조금 높지만 바로 위험하진 않아요. 온도를 먼저 챙겨요' : '높아요. 제습제 · 제습기 · 베딩 교체로 낮춰요';
    } else hh.className = 'hint hidden';
  };
  hints();

  form.addEventListener('input', persist);
  form.addEventListener('change', persist);
  $$('.stepper', form).forEach((s) => {
    const inp = $('input', s), step = +s.dataset.step;
    $$('button', s).forEach((b) => b.onclick = () => {
      const v = Math.max(0, (num(inp.value) || 0) + step * +b.dataset.d);
      inp.value = v || (b.dataset.d === '1' ? v : '');
      s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
      if (+b.dataset.d > 0 && (inp.name === 'worm' || inp.name === 'milpro' || inp.name === 'fruchu')) { const [x, y] = center(b); burst(x, y, { count: 5 }); }
      persist();
    });
  });
  $$('[data-chips]', form).forEach((c) => c.addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    if (c.dataset.single === '1') $$('.chip', c).forEach((x) => x.classList.toggle('on', x === b));
    else b.classList.toggle('on');
    if (c.dataset.chips === 'wormType') $('label', form.elements.worm.closest('.field')).firstChild.textContent = b.dataset.v;
    persist();
  }));
  $$('[data-cond]').forEach((b) => b.onclick = () => {
    const on = !b.classList.contains('on');
    $$('[data-cond]').forEach((x) => x.classList.remove('on'));
    if (on) b.classList.add('on');
    e.condition = on ? b.dataset.cond : '';
    if (on) { const [x, y] = center(b); hearts(x, y, 2); }
    clearTimeout(saveT); collect(); e.condition = on ? b.dataset.cond : ''; putEntry(e);
  });
  $('#fillGuide')?.addEventListener('click', () => {
    form.elements.milpro.value = st.milpro; form.elements.fruchu.value = st.fruchu; form.elements.iks.value = st.iks;
    if (st.fruitPerWeek >= 7 && !form.elements.fruit.value) form.elements.fruit.value = st.fruit;
    $$('.stepper', form).forEach((s) => { s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); });
    persist(); toast(`${st.label} 가이드로 채웠어요`);
  });

  // 사진
  const renderThumbs = () => {
    const list = mediaFor(e.id);
    $('#thumbs').innerHTML = list.map((m) => `<button type="button" class="thumb" data-m="${m.id}">${m.thumb ? `<img src="${URL.createObjectURL(m.thumb)}" alt="">` : ''}${m.type === 'video' ? '<span class="badge">영상</span>' : m.tag ? `<span class="badge">${esc(m.tag)}</span>` : ''}${connected() ? `<span class="st ${m.status === 'synced' ? 'ok' : m.status === 'error' ? 'err' : ''}"></span>` : ''}</button>`).join('')
      + '<button type="button" class="addmedia" id="addMedia">+<br>사진 · 영상</button>';
    $('#addMedia').onclick = () => { pendingTag = ''; $('#mediaInput').click(); };
    $$('.thumb', $('#thumbs')).forEach((t) => t.onclick = () => openViewer(M.get(t.dataset.m), true, renderThumbs));
  };
  let pendingTag = '';
  $('#weightPhoto').onclick = () => { pendingTag = '몸무게'; $('#mediaInput').click(); };
  $('#mediaInput').onchange = async (ev) => {
    collect();
    const n = await addMedia([...ev.target.files], e, pendingTag);
    ev.target.value = '';
    if (n) { renderThumbs(); toast(`${n}개 추가했어요`); }
  };
  renderThumbs();

  // 날짜 이동
  const go = (d) => { routeState.logDate = d; location.hash = `#/log/${d}`; };
  $('#logDate').onchange = (ev) => ev.target.value && go(ev.target.value);
  $('#prevDay').onclick = () => go(addDays(date, -1));
  $('#nextDay').onclick = () => go(addDays(date, 1));
  $$('.daystrip button').forEach((b) => b.onclick = () => go(b.dataset.d));

  $('#saveBtn').onclick = async (ev) => {
    const [x, y] = center(ev.currentTarget);
    clearTimeout(saveT); collect(); await putEntry(e);
    burst(x, y - 10, { count: 22 });
    const ok = hasFood(e) ? '냠냠! 오늘 식단 기록 완료' : '기록 완료!';
    toast(connected() ? `${ok} · 노션에 저장할게요` : ok);
    showEater(x, y);
    syncPush();
  };
}

function showEater(x, y) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${x - 40}px;top:${y - 200}px;z-index:96;pointer-events:none`;
  el.innerHTML = pygmySVG({ size: 80, mood: 'eat', cls: 'hop' });
  document.body.appendChild(el);
  el.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 1600, fill: 'both' }).onfinish = () => el.remove();
}

/* ───────────────────────── 사진 뷰어 ───────────────────────── */
function openViewer(m, canDelete, after) {
  const v = document.createElement('div');
  v.className = 'viewer';
  const src = m.url || (m.view || m.blob || m.thumb ? URL.createObjectURL(m.view || m.blob || m.thumb) : '');
  const isVideo = m.type === 'video';
  v.innerHTML = `<button class="close" aria-label="닫기">✕</button>
    <div>${isVideo && (m.blob || m.url) ? `<video src="${src}" controls playsinline autoplay></video>` : `<img src="${src}" alt="">`}
    <div class="cap">${fmtDate(m.date)}${m.tag ? ` · ${esc(m.tag)}` : ''}${isVideo && !m.blob && !m.url ? ' · 영상 원본은 노션에 있어요' : ''}${m.status === 'error' ? ` · 업로드 실패: ${esc(m.error)}` : ''}</div>
    ${canDelete ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm ghost" style="color:#fff" data-del>로컬에서 지우기</button></div>' : ''}</div>`;
  document.body.appendChild(v);
  const close = () => v.remove();
  v.onclick = (ev) => { if (ev.target === v || ev.target.closest('.close')) close(); };
  $('[data-del]', v)?.addEventListener('click', async () => {
    if (!confirm(m.status === 'synced' ? '이 기기에서만 지워요. 노션에 올라간 사진은 그대로 남아요.' : '아직 노션에 안 올라간 사진이에요. 지울까요?')) return;
    M.delete(m.id); await db.del('media', m.id); close(); after?.();
  });
}

/* ───────────────────────── 앨범 ───────────────────────── */
let remoteAlbum = [];
function viewAlbum(root) {
  const p = pet();
  const local = [...M.values()].filter((m) => m.petId === p.id);
  const known = new Set(local.map((m) => m.blockId).filter(Boolean));
  const remote = remoteAlbum.filter((r) => !known.has(r.blockId) && S.pets.find((x) => x.name === r.pet)?.id === p.id);
  const all = [...local, ...remote.map((r) => ({ ...r, id: 'r_' + r.blockId, remote: true }))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  const byDay = all.reduce((acc, m) => ((acc[m.date] ||= []).push(m), acc), {});

  root.innerHTML = `
    <p class="eyebrow">앨범</p>
    <div class="row between"><h1 class="title" style="margin:0">${esc(p.name)} 앨범 <span class="thin pixel" style="font-size:16px">${all.length}</span></h1>
    ${connected() ? '<button class="btn sm ghost" id="pullAlbum">노션에서 불러오기</button>' : ''}</div>
    <div class="row" style="margin:12px 0 0">
      <label class="btn blue grow" for="albumInput">사진 · 영상 추가 (오늘)</label>
      <input type="file" id="albumInput" accept="image/*,video/*" multiple hidden>
    </div>
    ${all.length ? Object.entries(byDay).map(([d, list]) => `
      <div class="album-day">${fmtDate(d)}</div>
      <div class="album-grid">${list.map((m) => `<button class="thumb" data-m="${m.id}">${m.remote ? (m.type === 'image' ? `<img src="${esc(m.url)}" alt="" loading="lazy">` : '') : m.thumb ? `<img src="${URL.createObjectURL(m.thumb)}" alt="">` : ''}${m.type === 'video' ? '<span class="badge">영상</span>' : ''}</button>`).join('')}</div>`).join('')
    : `<div class="empty-state">${pygmySVG({ size: 90, mood: 'sleep' })}<br>아직 사진이 없어요.<br>기록할 때 사진을 넣으면 여기 모여요.</div>`}
  `;
  $('#albumInput').onchange = async (ev) => {
    const e = getEntry(today(), p);
    const n = await addMedia([...ev.target.files], e);
    ev.target.value = '';
    if (n) { toast(`${n}개 추가했어요`); viewAlbum(root); }
  };
  $$('.thumb', root).forEach((t) => t.onclick = () => {
    const id = t.dataset.m;
    const m = M.get(id) || all.find((x) => x.id === id);
    openViewer(m, !m.remote, () => viewAlbum(root));
  });
  $('#pullAlbum')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true; ev.currentTarget.textContent = '불러오는 중…';
    try {
      const r = await api(`/album?from=${addDays(today(), -400)}`);
      remoteAlbum = r.items; toast(`노션에서 ${r.items.length}개 확인했어요`);
    } catch (err) { toast(`불러오기 실패: ${err.message}`); }
    viewAlbum(root);
  });
}

/* ───────────────────────── 월간 회고 ───────────────────────── */
function lineChart(points, { h = 120, unit = '', color = '#151514', band } = {}) {
  if (points.length < 1) return '<div class="muted small">기록이 없어요</div>';
  const W = 320, P = 22;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys, band?.[0] ?? Infinity), max = Math.max(...ys, band?.[1] ?? -Infinity);
  if (min === max) { min -= 1; max += 1; }
  const days = points[0].days;
  const X = (d) => P + ((d - 1) / Math.max(1, days - 1)) * (W - P * 1.5);
  const Y = (v) => h - 18 - ((v - min) / (max - min)) * (h - 34);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">
    ${band ? `<rect x="${P}" width="${W - P * 1.5}" y="${Y(band[1])}" height="${Y(band[0]) - Y(band[1])}" fill="#dfe8fb"/>` : ''}
    <line x1="${P}" x2="${W - P / 2}" y1="${h - 18}" y2="${h - 18}" stroke="#e3e1db"/>
    <text x="0" y="${Y(max) + 3}">${+max.toFixed(1)}</text><text x="0" y="${Y(min) + 3}">${+min.toFixed(1)}</text>
    ${[1, 8, 15, 22, 29].filter((d) => d <= days).map((d) => `<text x="${X(d) - 3}" y="${h - 4}">${d}</text>`).join('')}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${points.map((p) => `<rect x="${X(p.x) - 2.5}" y="${Y(p.y) - 2.5}" width="5" height="5" fill="${color}"/>`).join('')}
  </svg>`;
}
function barChart(rows, days, h = 110) {
  const W = 320, P = 22, bw = (W - P * 1.5) / days;
  const max = Math.max(1, ...rows.map((r) => r.a + r.b));
  const Y = (v) => ((h - 30) * v) / max;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">
    <line x1="${P}" x2="${W - P / 2}" y1="${h - 18}" y2="${h - 18}" stroke="#e3e1db"/>
    <text x="0" y="12">${max}</text>
    ${rows.map((r) => {
      const x = P + (r.x - 1) * bw + 1;
      return `<rect x="${x}" width="${bw - 2}" y="${h - 18 - Y(r.a)}" height="${Y(r.a)}" fill="#b48b63"/>
              <rect x="${x}" width="${bw - 2}" y="${h - 18 - Y(r.a) - Y(r.b)}" height="${Y(r.b)}" fill="#f5e98e"/>
              ${r.w ? `<rect x="${x + bw / 2 - 3}" width="4" y="${h - 18 - Y(r.a) - Y(r.b) - 7}" height="4" fill="#4b3b31"/>` : ''}`;
    }).join('')}
    ${[1, 8, 15, 22, 29].filter((d) => d <= days).map((d) => `<text x="${P + (d - 1) * bw}" y="${h - 4}">${d}</text>`).join('')}
  </svg>`;
}

function viewMonth(root) {
  const p = pet();
  const mk = routeState.month;
  const days = monthDays(mk);
  const list = petEntries(p).filter((e) => monthKey(e.date) === mk).sort((a, b) => (a.date > b.date ? 1 : -1));
  const byDate = Object.fromEntries(list.map((e) => [e.date, e]));
  const media = [...M.values()].filter((m) => m.petId === p.id && monthKey(m.date) === mk);
  const mediaDays = new Set(media.map((m) => m.date));
  const first = parse(`${mk}-01`).getDay();
  const retro = E.get(retroId(mk, p.id)) || { id: retroId(mk, p.id), kind: '회고', date: `${mk}-01`, pet: p.name, petId: p.id, memo: '', good: '', bad: '', next: '', capture: false };
  const sum = (k) => list.reduce((a, e) => a + (num(e[k]) || 0), 0);
  const cnt = (f) => list.filter(f).length;
  const weights = list.filter((e) => e.weight).map((e) => ({ x: parse(e.date).getDate(), y: e.weight, days }));
  const temps = list.filter((e) => e.temp).map((e) => ({ x: parse(e.date).getDate(), y: e.temp, days }));
  const tr = tempFor(weeksOld(p, `${mk}-15`));
  const recorded = list.filter((e) => !isEmpty(e)).length;
  const avg = (k) => { const v = list.map((e) => num(e[k])).filter((x) => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; };
  const wDelta = weights.length >= 2 ? +(weights.at(-1).y - weights[0].y).toFixed(1) : null;
  const t = today();
  const [y, m] = mk.split('-').map(Number);

  root.innerHTML = `
    <div class="print-only" style="margin-bottom:8px"><div class="row between"><b>금이 킹 노트 · 월간 회고</b><span>${esc(p.name)}</span></div></div>
    <div class="monthbar no-print-nav">
      <button class="icon-btn no-print" id="prevM" aria-label="이전 달">‹</button>
      <h1 class="title">${y}년 ${m}월 <span class="thin">${esc(p.name)}</span></h1>
      <button class="icon-btn no-print" id="nextM" aria-label="다음 달">›</button>
    </div>
    <div class="row no-print" style="margin:6px 0 4px">
      <button class="btn sm" id="printBtn">인쇄 · PDF 저장</button>
      <button class="btn sm ghost" id="csvBtn">CSV 다운로드</button>
    </div>

    <div class="card">
      <div class="cal">
        ${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}
        ${[...Array(first)].map(() => '<div class="d empty"></div>').join('')}
        ${[...Array(days)].map((_, i) => {
          const d = `${mk}-${pad(i + 1)}`; const e = byDate[d];
          const dots = e ? [hasFood(e) && 'food', e.water && 'water', e.clean?.length && 'clean', e.weight && 'weight'].filter(Boolean) : [];
          if (mediaDays.has(d)) dots.push('photo');
          return `<button class="d ${dots.length ? 'has' : ''} ${d === t ? 'today' : ''}" data-d="${d}"><span class="dn">${i + 1}</span><span class="dots">${dots.map((k) => `<i class="dot-${k}"></i>`).join('')}</span></button>`;
        }).join('')}
      </div>
      <div class="legend"><span><i class="dot-food"></i>식단</span><span><i class="dot-water"></i>물 교체</span><span><i class="dot-clean"></i>청소</span><span><i class="dot-weight"></i>몸무게</span><span><i class="dot-photo"></i>사진</span></div>
    </div>

    <div class="statgrid">
      <div class="stat yellow"><div class="l">기록한 날</div><div class="v">${recorded}<small>/ ${days}일</small></div></div>
      <div class="stat blue"><div class="l">몸무게 변화</div><div class="v">${wDelta == null ? '-' : `${wDelta > 0 ? '+' : ''}${wDelta}`}<small>g</small></div></div>
      <div class="stat"><div class="l">물 교체</div><div class="v">${cnt((e) => e.water)}<small>회</small></div></div>
      <div class="stat"><div class="l">청소한 날</div><div class="v">${cnt((e) => e.clean?.length)}<small>일</small></div></div>
      <div class="stat"><div class="l">웜 급여</div><div class="v">${cnt((e) => e.worm > 0)}<small>회 · ${sum('worm')}마리</small></div></div>
      <div class="stat"><div class="l">과일 큐브</div><div class="v">${cnt((e) => e.fruit > 0)}<small>회</small></div></div>
      <div class="stat"><div class="l">칼슘 · 비타민</div><div class="v">${cnt((e) => e.supp?.includes('칼슘'))}·${cnt((e) => e.supp?.includes('비타민'))}<small>회</small></div></div>
      <div class="stat"><div class="l">핸들링</div><div class="v">${sum('handling')}<small>회</small></div></div>
      <div class="stat"><div class="l">평균 온도</div><div class="v">${avg('temp')}<small>°C</small></div></div>
      <div class="stat"><div class="l">평균 습도</div><div class="v">${avg('humid')}<small>%</small></div></div>
    </div>

    <div class="card"><div class="card-head"><h2 class="sec">몸무게</h2><span class="muted small">g</span></div>${lineChart(weights, { color: '#c2533c' })}</div>
    <div class="card"><div class="card-head"><h2 class="sec">사료 급여</h2><span class="legend" style="margin:0"><span><i class="dot-food"></i>밀프로</span><span><i style="background:#f5e98e"></i>후르츄</span><span><i style="background:#4b3b31"></i>웜</span></span></div>
      ${barChart([...Array(days)].map((_, i) => { const e = byDate[`${mk}-${pad(i + 1)}`]; return { x: i + 1, a: num(e?.milpro) || 0, b: num(e?.fruchu) || 0, w: (e?.worm || 0) > 0 }; }), days)}</div>
    <div class="card"><div class="card-head"><h2 class="sec">케이지 온도</h2>${tr ? `<span class="muted small">파란 띠 = 적정 ${tr.min}~${tr.max}°C</span>` : ''}</div>${lineChart(temps, { color: '#2f4e9a', band: tr ? [tr.min, tr.max] : null })}</div>

    <div class="card retro">
      <div class="card-head"><h2 class="sec">이번 달 회고</h2>${p.mainRoom ? `<label class="row small" style="margin:0;gap:6px"><input type="checkbox" id="capture" ${retro.capture ? 'checked' : ''}> 보증 캡처 완료</label>` : ''}</div>
      <label>잘 챙긴 것</label><textarea data-r="good" placeholder="예: 물 교체를 한 번도 안 빠뜨렸다">${esc(retro.good)}</textarea>
      <div class="print-only">${esc(retro.good)}</div>
      <label>아쉬웠던 것 · 걱정</label><textarea data-r="bad" placeholder="예: 습도가 자주 50%를 넘었다">${esc(retro.bad)}</textarea>
      <div class="print-only">${esc(retro.bad)}</div>
      <label>다음 달 목표</label><textarea data-r="next" placeholder="예: 핸들링 하루 5회">${esc(retro.next)}</textarea>
      <div class="print-only">${esc(retro.next)}</div>
    </div>

    ${list.some((e) => e.memo) ? `<div class="card"><div class="card-head"><h2 class="sec">이번 달 메모</h2></div>${list.filter((e) => e.memo).map((e) => `<div class="kv"><span>${fmtDate(e.date)}</span><b style="font-weight:400;text-align:left;flex:1;margin-left:12px">${esc(e.memo)}</b></div>`).join('')}</div>` : ''}
  `;

  $('#prevM').onclick = () => { routeState.month = addMonths(mk, -1); viewMonth(root); };
  $('#nextM').onclick = () => { routeState.month = addMonths(mk, 1); viewMonth(root); };
  $$('.cal .d[data-d]').forEach((b) => b.onclick = () => { location.hash = `#/log/${b.dataset.d}`; });
  $('#printBtn').onclick = () => window.print();
  $('#csvBtn').onclick = () => downloadCSV(list, `pygmy-${p.name}-${mk}.csv`);
  let rt;
  $$('[data-r]').forEach((ta) => ta.oninput = () => {
    retro[ta.dataset.r] = ta.value;
    retro.memo = ['잘 챙긴 것: ' + (retro.good || ''), '아쉬운 것: ' + (retro.bad || ''), '다음 달 목표: ' + (retro.next || '')].join('\n');
    clearTimeout(rt); rt = setTimeout(() => putEntry(retro), 500);
  });
  $('#capture')?.addEventListener('change', (ev) => { retro.capture = ev.target.checked; putEntry(retro); if (ev.target.checked) { const [x, yy] = center(ev.target); burst(x, yy); } });
}

function downloadCSV(list, filename) {
  const cols = [['date', '날짜'], ['milpro', '밀프로'], ['fruchu', '후르츄'], ['wormType', '웜 종류'], ['worm', '웜'], ['iks', '익스'], ['iksNew', '익스 교체'], ['fruit', '과일큐브'], ['fruitKinds', '과일'], ['supp', '영양제'], ['water', '물 교체'], ['honey', '꿀·젤리'], ['feedReset', '사료 전체교체'], ['weight', '몸무게(g)'], ['condition', '컨디션'], ['temp', '온도'], ['humid', '습도'], ['clean', '청소'], ['handling', '핸들링'], ['memo', '메모']];
  const cell = (v) => { const s = Array.isArray(v) ? v.join('/') : v === true ? 'O' : v === false ? '' : v ?? ''; return /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.map((c) => c[1]).join(','), ...list.map((e) => cols.map(([k]) => cell(e[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ───────────────────────── 케어시트 ───────────────────────── */
const QUICK = ['온도', '습도', '급수기', '식단', '과일', '밀웜', '영양제', '핸들링', '탈출', '청소', '베딩', '보증'];
function viewCare(root) {
  if (!CARE) {
    root.innerHTML = `
      <p class="eyebrow">케어시트</p>
      <div class="card lock">
        ${pygmySVG({ size: 90, mood: 'sleep' })}
        <h1 class="title" style="font-size:20px">케어시트가 잠겨 있어요</h1>
        <p class="muted small">드길샵 케어시트는 외부 공유 금지 자료라서<br>앱 키로 잠가 두었어요.</p>
        <div class="form" style="text-align:left"><label>앱 키</label><input type="password" id="careKey" value="${esc(S.appKey)}" placeholder="xxxx-xxxx-xxxx-xxxx"></div>
        <button class="btn primary block" style="margin-top:12px" id="unlock">열기</button>
      </div>`;
    $('#unlock').onclick = async () => {
      const k = $('#careKey').value.trim();
      try { await unlockCare(k); S.appKey = S.appKey || k; saveSettings(); toast('케어시트를 열었어요'); viewCare(root); }
      catch { toast('키가 맞지 않아요'); }
    };
    return;
  }
  const p = pet();
  const st = stageFor(weeksOld(p));
  root.innerHTML = `
    <p class="eyebrow">케어시트 · ${esc(CARE.version)}</p>
    <h1 class="title">찾아보기</h1>
    <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="text" enterkeyhint="search" id="q" placeholder="온도, 밀웜, 탈출…" value="${esc(routeState.q)}"><button class="icon-btn" id="clearQ" aria-label="지우기">✕</button></div>
    <div class="qchips">${QUICK.map((q) => `<button class="chip" data-q="${q}">${q}</button>`).join('')}</div>
    ${st ? `<div class="card yellow small"><b>지금 ${esc(p.name)}는 ${st.label}</b> · 밀프로 ${st.milpro} · 후르츄 ${st.fruchu} · 익스 ${st.iks} · 과일 ${st.fruitPerWeek >= 7 ? '매일' : `주 ${st.fruitPerWeek}회`}${st.worm ? ` · ${esc(st.worm)} 주 ${st.wormPerWeek}회` : ''}</div>` : ''}
    <div id="careList"></div>
    <div class="card small muted">
      <div class="kv"><span>출처</span><b>${esc(CARE.source)}</b></div>
      <div class="kv"><span>전화</span><b><a href="tel:${esc(CARE.contact.tel)}">${esc(CARE.contact.tel)}</a></b></div>
      <div class="kv"><span>인스타</span><b>${esc(CARE.contact.insta)}</b></div>
      <div class="kv"><span>스토어</span><b><a href="${esc(CARE.contact.store)}" target="_blank" rel="noopener">네이버 드길샵</a></b></div>
    </div>`;

  const render = () => {
    const q = routeState.q.trim();
    const terms = q.split(/\s+/).filter(Boolean);
    const hl = (s) => {
      let out = esc(s);
      terms.forEach((t) => { out = out.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => `<mark>${m}</mark>`); });
      return out;
    };
    let total = 0;
    const html = CARE.sections.map((s, si) => {
      const items = s.items.filter((i) => !terms.length || terms.every((t) => (s.title + i.h + i.t + (i.tags || []).join(' ')).includes(t)));
      total += items.length;
      if (!items.length) return '';
      return `<details class="care-sec" ${terms.length ? 'open' : ''}>
        <summary><span class="num">${pad(si + 1)}</span>${hl(s.title)}<span class="cnt">${items.length}</span></summary>
        ${items.map((i) => `<div class="care-item"><h3>${hl(i.h)}${(i.tags || []).map((t) => `<span class="tag ${t === '주의' || t === '금지' ? 'danger' : t === '필수' ? 'yellow' : ''}">${esc(t)}</span>`).join('')}</h3><p>${hl(i.t)}</p></div>`).join('')}
      </details>`;
    }).join('');
    $('#careList').innerHTML = html || `<div class="empty-state">${pygmySVG({ size: 70, mood: 'idle' })}<br>'${esc(q)}'에 대한 내용이 없어요.</div>`;
    $$('.qchips .chip').forEach((c) => c.classList.toggle('on', c.dataset.q === q));
  };
  render();
  $('#q').oninput = (ev) => { routeState.q = ev.target.value; render(); };
  $('#clearQ').onclick = () => { routeState.q = ''; $('#q').value = ''; render(); };
  $$('.qchips .chip').forEach((c) => c.onclick = () => { routeState.q = routeState.q === c.dataset.q ? '' : c.dataset.q; $('#q').value = routeState.q; render(); });
}

/* ───────────────────────── 설정 ───────────────────────── */
function openSettings() {
  openSheet(`
    <h1 class="title" style="font-size:22px">설정</h1>
    <p class="eyebrow">아이</p>
    <div id="petList">${S.pets.map((p) => `<div class="pet-row ${p.id === pet()?.id ? 'on' : ''}"><span class="pet-dot"></span><div class="grow"><b>${esc(p.name)}</b><div class="muted small">${weeksOld(p) != null ? `생후 ${weeksOld(p)}주` : '나이 모름'}${p.sex ? ` · ${esc(p.sex)}` : ''}</div></div><button class="btn sm ghost" data-edit="${p.id}">수정</button></div>`).join('')}</div>
    <button class="btn sm" id="addPet">+ 아이 추가</button>

    <p class="eyebrow">노션 연결</p>
    <div class="card form">
      <label>워커 주소</label><input type="url" id="workerUrl" value="${esc(S.workerUrl)}" placeholder="https://pygmy-care-notion.내계정.workers.dev">
      <label>앱 키</label><input type="password" id="appKey" value="${esc(S.appKey)}" placeholder="xxxx-xxxx-xxxx-xxxx">
      <div class="row" style="margin-top:12px">
        <button class="btn sm primary" id="saveConn">저장 · 연결 확인</button>
        <button class="btn sm ghost" id="pull">노션에서 가져오기</button>
      </div>
      <div class="small muted" id="connMsg" style="margin-top:8px"></div>
    </div>

    <p class="eyebrow">기타</p>
    <div class="card form">
      <label>영상 최대 용량 (MB) <span class="muted small">노션 무료 플랜은 파일당 5MB</span></label>
      <input type="number" id="maxVideo" min="1" max="5000" value="${S.maxVideoMB}">
      <div class="row" style="margin-top:12px">
        <button class="btn sm ghost" id="backup">백업 파일 받기</button>
        <label class="btn sm ghost" for="restore">백업 불러오기</label><input type="file" id="restore" accept="application/json" hidden>
      </div>
      ${CARE ? '<div class="row" style="margin-top:8px"><button class="btn sm ghost" id="relock">케어시트 다시 받기</button></div>' : ''}
    </div>
    <p class="muted small" style="text-align:center;margin-top:18px">${pygmySVG({ size: 40, mood: 'idle' })}<br>금이 킹 노트 · 기록은 이 기기에 먼저 저장되고 노션으로 옮겨져요.</p>
  `, (sh) => {
    $$('[data-edit]', sh).forEach((b) => b.onclick = () => openPetForm(S.pets.find((p) => p.id === b.dataset.edit)));
    $('#addPet', sh).onclick = () => openPetForm();
    $('#maxVideo', sh).onchange = (ev) => { S.maxVideoMB = Math.max(1, +ev.target.value || 5); saveSettings(); };
    $('#saveConn', sh).onclick = async () => {
      S.workerUrl = $('#workerUrl', sh).value.trim(); S.appKey = $('#appKey', sh).value.trim(); saveSettings();
      const msg = $('#connMsg', sh);
      if (!CARE && S.appKey) unlockCare(S.appKey).catch(() => {});
      if (!connected()) { msg.textContent = '저장했어요. 워커 주소와 앱 키를 모두 넣으면 노션에 저장돼요.'; renderSync(); return; }
      msg.textContent = '확인 중…';
      try {
        const r = await api('/ping');
        if (r.missing.length) { await api('/setup', { method: 'POST' }); msg.textContent = `'${r.title}' 연결됨. 속성 ${r.missing.length}개를 만들었어요.`; }
        else msg.textContent = `'${r.title}' 연결됨.`;
        scheduleSync();
      } catch (err) { msg.textContent = `연결 실패: ${err.message}`; }
      renderSync();
    };
    $('#pull', sh).onclick = async () => {
      const msg = $('#connMsg', sh);
      if (!connected()) { msg.textContent = '먼저 연결해 주세요.'; return; }
      msg.textContent = '가져오는 중…';
      try { const n = await syncPull(); msg.textContent = `${n}개 기록을 가져왔어요.`; route(); } catch (err) { msg.textContent = `실패: ${err.message}`; }
    };
    $('#backup', sh).onclick = () => {
      const data = { app: 'pygmy-note', at: new Date().toISOString(), settings: { ...S, appKey: '' }, entries: [...E.values()] };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = `pygmy-note-backup-${today()}.json`; a.click();
    };
    $('#restore', sh).onchange = async (ev) => {
      try {
        const data = JSON.parse(await ev.target.files[0].text());
        if (data.app !== 'pygmy-note') throw new Error();
        for (const e of data.entries) { E.set(e.id, e); await db.put('entries', e); }
        for (const p of data.settings.pets || []) if (!S.pets.find((x) => x.id === p.id)) S.pets.push(p);
        if (!S.petId) S.petId = S.pets[0]?.id;
        saveSettings(); toast(`${data.entries.length}개 기록을 불러왔어요`); closeSheet(); renderTop(); route();
      } catch { toast('백업 파일을 읽지 못했어요'); }
    };
    $('#relock', sh)?.addEventListener('click', async () => {
      try { await unlockCare(S.appKey); toast('케어시트를 새로 받았어요'); } catch { toast('앱 키가 맞지 않아요'); }
    });
  });
}

function openPetForm(p) {
  openSheet(`<h1 class="title" style="font-size:22px">${p ? '아이 정보 수정' : '아이 추가'}</h1><div id="pf">${petFormHTML(p || { adopt: today() })}</div>
    <div class="row" style="margin-top:16px"><button class="btn primary grow" id="pfSave">저장</button>${p && S.pets.length > 1 ? '<button class="btn ghost" id="pfDel" style="color:var(--danger)">삭제</button>' : ''}</div>`, (sh) => {
    $('#pfSave', sh).onclick = () => {
      const np = readPetForm($('#pf', sh), p);
      if (p) S.pets[S.pets.findIndex((x) => x.id === p.id)] = np; else { S.pets.push(np); S.petId = np.id; }
      saveSettings(); closeSheet(); renderTop(); route();
    };
    $('#pfDel', sh)?.addEventListener('click', () => {
      if (!confirm(`${p.name}을(를) 목록에서 지울까요? 기록은 남아 있어요.`)) return;
      S.pets = S.pets.filter((x) => x.id !== p.id); S.petId = S.pets[0]?.id || ''; saveSettings(); closeSheet(); renderTop(); route();
    });
  });
}

function openPetSwitch() {
  openSheet(`<h1 class="title" style="font-size:22px">누구 기록할까요?</h1>
    ${S.pets.map((p) => `<button class="pet-row ${p.id === pet()?.id ? 'on' : ''}" style="width:100%;text-align:left" data-pick="${p.id}"><span class="pet-dot"></span><div class="grow"><b>${esc(p.name)}</b><div class="muted small">${weeksOld(p) != null ? `생후 ${weeksOld(p)}주` : ''}</div></div></button>`).join('')}
    <button class="btn sm" style="margin-top:8px" id="spAdd">+ 아이 추가</button>`, (sh) => {
    $$('[data-pick]', sh).forEach((b) => b.onclick = () => { S.petId = b.dataset.pick; saveSettings(); closeSheet(); renderTop(); route(); });
    $('#spAdd', sh).onclick = () => openPetForm();
  });
}

function renderTop() {
  const p = pet();
  $('#petName').textContent = p?.name || '금이 킹 노트';
  renderSync();
}

/* ───────────────────────── 시작 ───────────────────────── */
async function boot() {
  $$('.tabbar a').forEach((a) => { a.querySelector('i').outerHTML = TAB_ICONS[a.dataset.tab]; });
  try {
    for (const e of await db.all('entries')) E.set(e.id, e);
    for (const m of await db.all('media')) M.set(m.id, m);
  } catch (err) { console.warn('IndexedDB 사용 불가', err); }
  if (S.appKey && !CARE) unlockCare(S.appKey).then(() => route()).catch(() => {});
  $('#openSettings').onclick = openSettings;
  $('#petSwitch').onclick = () => (S.pets.length ? openPetSwitch() : null);
  $('#sheetBackdrop').onclick = closeSheet;
  window.addEventListener('hashchange', route);
  window.addEventListener('online', syncPush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPush(); });
  renderTop();
  route();
  syncPush();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
