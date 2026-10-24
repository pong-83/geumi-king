import { db } from './db.js';
import { O, draw, geumi, STICKERS, sticker, icon, img } from './pixel.js';

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
const defaults = { workerUrl: '', appKey: '', maxVideoMB: 5, pets: [], petId: '', folders: [], careLocked: false };
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

async function addMedia(files, entry, tag = '', folder = '') {
  let added = 0;
  for (const f of files) {
    const isVideo = f.type.startsWith('video/');
    if (isVideo && f.size > S.maxVideoMB * 1024 * 1024) {
      toast(`영상은 ${S.maxVideoMB}MB까지 올릴 수 있어요 (${(f.size / 1048576).toFixed(1)}MB)`);
      continue;
    }
    const m = { id: uid(), entryId: entry.id, date: entry.date, petId: entry.petId, type: isVideo ? 'video' : 'image', tag, folder, createdAt: Date.now(), status: 'pending' };
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
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const replay = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// 스티커가 포물선을 그리며 날아가요
function fly(src, fromEl, toEl, size = 44, rot = 0) {
  return new Promise((res) => {
    if (reduced || !fromEl || !toEl) { res(); return; }
    const [ax, ay] = center(fromEl), [bx, by] = center(toEl);
    const im = new Image(); im.src = src; im.className = 'flyer'; im.style.width = size + 'px'; im.alt = '';
    $('#fx').appendChild(im);
    const x0 = ax - size / 2, y0 = ay - size / 2, x1 = bx - size / 2, y1 = by - size / 2;
    const mx = (x0 + x1) / 2 + 30, my = Math.min(y0, y1) - 70;
    im.animate([
      { transform: `translate(${x0}px,${y0}px) rotate(0deg) scale(1.15)` },
      { transform: `translate(${mx}px,${my}px) rotate(${rot / 2}deg) scale(1)`, offset: 0.5 },
      { transform: `translate(${x1}px,${y1}px) rotate(${rot}deg) scale(.45)` },
    ], { duration: 650, easing: 'cubic-bezier(.45,0,.55,1)' }).onfinish = () => { im.remove(); res(); };
  });
}
function burst(x, y, srcs, n = 8) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const im = new Image(); im.src = srcs[i % srcs.length]; im.className = 'flyer'; im.style.width = '18px'; im.alt = '';
    $('#fx').appendChild(im);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, d = 50 + Math.random() * 50;
    im.animate([
      { transform: `translate(${x - 9}px,${y - 9}px) scale(.5)`, opacity: 1 },
      { transform: `translate(${x - 9 + Math.cos(a) * d}px,${y - 9 + Math.sin(a) * d}px) scale(1.1)`, opacity: 0 },
    ], { duration: 800 + Math.random() * 300, easing: 'ease-out' }).onfinish = () => im.remove();
  }
}
const hearts = (x, y, n = 4) => burst(x, y, [icon('heart', 3)], n);

/* ───────────────────────── 시트(모달) ───────────────────────── */
function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = html; sh.hidden = false; $('#sheetBackdrop').hidden = false;
  onMount?.(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; $('#sheet').innerHTML = ''; }

/* ───────────────────────── 공통 조각 ───────────────────────── */
const SVG_MINUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="6" width="10" height="2.6" fill="#2f4166"/></svg>';
const SVG_PLUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="6" width="10" height="2.6" fill="#2f4166"/><rect x="5.7" y="2.3" width="2.6" height="10" fill="#2f4166"/></svg>';
const SVG_PREV = '<svg viewBox="0 0 14 14" aria-hidden="true" shape-rendering="crispEdges"><path fill="#2f4166" d="M8 2h2v2H8zM6 4h2v2H6zM4 6h2v2H4zM6 8h2v2H6zM8 10h2v2H8z"/></svg>';
const SVG_NEXT = '<svg viewBox="0 0 14 14" aria-hidden="true" shape-rendering="crispEdges"><path fill="#2f4166" d="M4 2h2v2H4zM6 4h2v2H6zM8 6h2v2H8zM6 8h2v2H6zM4 10h2v2H4z"/></svg>';
const SVG_SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2f4166" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const ROTS = [-8, 6, -3, 9, -6, 3, -10, 7];
const mmdd = (s) => { const d = parse(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
const savedChip = (id, text = '자동 저장') => `<span class="saved" id="${id}">${img(icon('check', 2), '', 'width:14px;height:10px')}<span>${text}</span></span>`;
function flashSaved(id = 'saved') {
  const el = $('#' + id); if (!el) return;
  el.lastElementChild.textContent = '저장됨 · 방금';
  replay(el, 'flash');
}
function stepper(name, val, step = 1, label = '') {
  return `<div class="stepper" data-step="${step}">
    <button type="button" class="key" data-d="-1" aria-label="${label} 빼기">${SVG_MINUS}</button>
    <input inputmode="decimal" type="number" name="${name}" value="${val ?? ''}" placeholder="0" min="0" step="${step}" aria-label="${label}">
    <button type="button" class="key" data-d="1" aria-label="${label} 더하기">${SVG_PLUS}</button></div>`;
}
const urlCache = new Map();
function blobURL(m, key = 'thumb') {
  const b = m[key]; if (!b) return '';
  const k = m.id + ':' + key;
  if (!urlCache.has(k)) urlCache.set(k, URL.createObjectURL(b));
  return urlCache.get(k);
}
const MOOD_OF = { 좋음: 'happy', 보통: 'idle', 주의: 'worry' };

/* ───────────────────────── 라우터 · 인덱스 탭 ───────────────────────── */
const routes = { today: viewToday, log: viewLog, album: viewAlbum, month: viewMonth, care: viewCare };
const TABS = Object.keys(routes);
let routeState = { logDate: today(), month: monthKey(today()), q: '', folder: null, openSec: new Set() };
let curTab = null, runT;

function placeRunner(name, animate) {
  const tab = $(`.tab[data-tab="${name}"]`), runner = $('#runner');
  if (!tab || !runner) return;
  const x = tab.offsetLeft + tab.offsetWidth / 2 - 21;
  const prev = runner._x == null ? x : runner._x;
  runner.classList.toggle('left', x < prev);
  if (animate && x !== prev) { runner.classList.add('go'); clearTimeout(runT); runT = setTimeout(() => runner.classList.remove('go'), 560); }
  if (!animate) runner.style.transition = 'none';
  runner.style.transform = `translateX(${x}px)`;
  runner._x = x;
  if (!animate) { void runner.offsetWidth; runner.style.transition = ''; }
}

function route() {
  const [, raw = 'today', arg] = location.hash.split('/');
  const name = routes[raw] ? raw : 'today';
  if (name === 'log' && arg) routeState.logDate = arg;
  const view = $('#view');
  $$('.tab').forEach((a) => { const on = a.dataset.tab === name; a.classList.toggle('on', on); a.toggleAttribute('aria-current', on); });
  const dir = curTab == null || curTab === name ? 0 : TABS.indexOf(name) > TABS.indexOf(curTab) ? 1 : -1;
  placeRunner(name, curTab != null);
  curTab = name;
  if (!pet()) { view.innerHTML = onboardingHTML(); bindOnboarding(); return; }
  routes[name](view);
  if (dir) {
    view.scrollTop = 0;
    if (!reduced) view.animate([{ transform: `translateX(${50 * dir}%) rotate(${2 * dir}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  }
}

/* ───────────────────────── 첫 실행 ───────────────────────── */
function petFormHTML(p = {}) {
  return `
    <div class="form">
      <label>이름</label><input type="text" name="name" value="${esc(p.name || '')}" placeholder="예: 금이" required>
      <label>입양일</label><input type="date" name="adopt" value="${esc(p.adopt || '')}">
      <label>입양 당시 주차 <small>(생일을 모르면 이걸로 나이를 계산해요)</small></label>
      <input type="number" name="adoptWeeks" min="0" max="60" value="${esc(p.adoptWeeks ?? 3)}">
      <label>생일 <small>(알면 입력, 주차보다 우선)</small></label><input type="date" name="birth" value="${esc(p.birth || '')}">
      <label>성별</label>
      <select name="sex">${['', '암컷', '수컷', '모름'].map((s) => `<option ${p.sex === s ? 'selected' : ''} value="${s}">${s || '선택 안 함'}</option>`).join('')}</select>
      <label>본방 이동일 <small>(분양보증 11개월 계산용)</small></label><input type="date" name="mainRoom" value="${esc(p.mainRoom || '')}">
    </div>`;
}
function readPetForm(root, base = {}) {
  const v = (n) => $(`[name=${n}]`, root).value.trim();
  return { ...base, id: base.id || uid(), name: v('name') || '금이', adopt: v('adopt'), adoptWeeks: num(v('adoptWeeks')) ?? 3, birth: v('birth'), sex: v('sex'), mainRoom: v('mainRoom') };
}
function onboardingHTML() {
  return `
    <div class="page">
      <span class="tape">처음 만나요</span>
      <div class="hero">
        <button class="geumi-btn" type="button" aria-hidden="true" tabindex="-1">${img(geumi('happy'), '', '', '')}</button>
        <div class="bubble">안녕! 나랑 같이 기록 시작할래?</div>
      </div>
      <div class="ground"></div>
      <p class="h-hand">우리 아이를 알려 주세요</p>
      <div id="onb">${petFormHTML({ name: '금이', adopt: today() })}</div>
      <button class="btn block" style="margin-top:16px" id="onbSave">시작하기</button>
    </div>`;
}
function bindOnboarding() {
  $('#onbSave').onclick = () => {
    const p = readPetForm($('#onb'));
    S.pets.push(p); S.petId = p.id; saveSettings(); renderTop();
    location.hash = '#/today'; route();
    setTimeout(() => { const s = $('#geumi'); if (s) { const [x, y] = center(s); hearts(x, y, 6); } }, 200);
  };
}

/* ───────────────────────── 오늘 ───────────────────────── */
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

const TODO_ICON = { '💧': 'drop', '🥣': 'bowl', '🍎': 'apple', '🐛': 'worm', '💊': 'pill', '📷': 'camera', '🛡️': 'shield', '✋': 'hand' };
const KEYS = ['milpro', 'fruchu', 'worm', 'iks', 'fruit', 'water', 'clean'];
const LINES = { milpro: '바삭바삭 밀프로!', fruchu: '달콤한 후르츄!', worm: '꿈틀꿈틀 맛있어요!', iks: '아삭아삭 익스!', fruit: '과일 냠냠!', water: '시원한 새 물이에요', clean: '깨끗해져서 좋아요' };
const PET_LINES = ['헤헤, 간지러워요', '왕관 삐뚤어지면 안 돼요!', '스티커 더 붙여 줘요', '쓰담쓰담 좋아요', '금이는 왕이에요'];

function goalsFor(st) {
  if (!st) return {};
  const g = { milpro: st.milpro, fruchu: st.fruchu, iks: st.iks };
  if (st.fruitPerWeek >= 7) g.fruit = st.fruit || 1;
  return g;
}
function stickerVal(e, k) {
  if (k === 'water') return e.water ? 1 : 0;
  if (k === 'clean') return e.clean?.length || 0;
  return num(e[k]) || 0;
}
function feedState(e, goals) {
  let fed = 0, goal = 0;
  for (const [k, g] of Object.entries(goals)) { if (!g) continue; fed += Math.min(stickerVal(e, k), g); goal += g; }
  return { fed, goal, full: goal > 0 && fed >= goal };
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
  const goals = goalsFor(st);
  const streakDays = [...Array(14)].map((_, i) => !isEmpty(getEntry(addDays(t, i - 13), p)));
  let streak = 0;
  for (let i = 13; i >= 0; i--) { if (streakDays[i]) streak++; else if (i === 13) continue; else break; }
  const rem = remindersFor(p);
  const tips = tipList();
  const label = (k) => (k === 'worm' ? e.wormType || '웜' : STICKERS[k].label);
  const fs0 = feedState(e, goals);
  const moodNow = () => (feedState(e, goals).full ? 'full' : 'idle');
  const together = p.adopt ? diffDays(t, p.adopt) + 1 : null;

  const rowHTML = (k) => {
    const v = stickerVal(e, k), n = Math.min(8, Math.ceil(v));
    const g = goals[k];
    const ct = k === 'water' ? (v ? '완료' : '') : g ? `${v}/${g}` : v ? `×${v}` : '';
    const done = k === 'water' ? !!v : g ? v >= g : v > 0;
    return `<span class="lb">${esc(label(k))}</span>
      <span class="sl" id="sl-${k}">${[...Array(n)].map((_, i) => img(sticker(k, 3), '', `transform:rotate(${ROTS[i % 8]}deg)`)).join('')}</span>
      <span class="ct ${done ? 'done' : ''}" id="ct-${k}">${ct}</span>`;
  };
  const heartsHTML = () => {
    const s = feedState(e, goals); if (!s.goal) return '';
    const on = Math.round((s.fed / s.goal) * 5);
    return [...Array(5)].map((_, i) => img(icon(i < on ? 'heart' : 'heartOff', 3))).join('');
  };

  root.innerHTML = `
    <div class="page">
      <div class="row between" style="flex-wrap:nowrap">
        <span class="tape">${mmdd(t)} ${esc(p.name)}의 하루</span>
        <div class="hearts" id="hearts" aria-label="배부름">${heartsHTML()}</div>
      </div>
      <div class="hero">
        <button class="geumi-btn" id="geumi" aria-label="${esc(p.name)} 쓰다듬기">${img(geumi(sleeping ? 'sleep' : fs0.full ? 'full' : 'idle'), '', '', '')}<span class="mouth" id="mouth"></span></button>
        <div class="bubble" id="bubble">${sleeping ? '쿨쿨… 낮엔 자는 시간이에요' : fs0.full ? '배불러… 오늘 식단 완료!' : '오늘은 뭐 먹어요?'}</div>
        <div class="stamp-done" id="doneStamp" ${fs0.full ? '' : 'hidden'}><span>참 잘</span><span>했어요</span></div>
        <div class="age">${w != null ? `생후 <b>${w}</b>주` : ''}${together ? `<br>함께 ${together}일` : ''}</div>
      </div>
      <div class="ground"></div>
      ${KEYS.map((k) => `<div class="rowline" id="row-${k}">${rowHTML(k)}</div>`).join('')}
      <div class="rowline" style="min-height:48px">
        <label class="lb" for="wtToday">몸무게</label>
        <div class="weight"><i></i><input id="wtToday" type="number" inputmode="decimal" step="0.1" placeholder="오늘 몇 g?" value="${e.weight ?? ''}"><span style="font-family:var(--px);font-size:13px">g</span></div>
      </div>
      <div class="streak" aria-label="최근 14일 기록">${streakDays.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row between small muted" style="margin-top:4px"><span>최근 14일</span><span class="ex">${streak}일 연속</span></div>
    </div>

    <div class="stksheet">
      <div class="stksheet-head">${savedChip('savedToday', '붙이면 바로 저장')}<button class="link-btn" id="undo" hidden>되돌리기</button></div>
      <div class="stkgrid">${KEYS.map((k, i) => `<button class="stk" data-k="${k}" aria-label="${esc(label(k))} 스티커 붙이기">${img(sticker(k, 5), '', `transform:rotate(${ROTS[i]}deg)`)}<span>${esc(label(k))}</span></button>`).join('')}</div>
    </div>

    ${st ? `
    <div class="page">
      <div class="sec-title"><span class="tape blue">${esc(st.label)} 가이드</span><span class="small muted">하루 넣어줄 개수</span></div>
      <div class="guide">
        <div><b>${st.milpro}</b><span>밀프로</span></div>
        <div><b>${st.fruchu}</b><span>후르츄</span></div>
        <div><b>${st.iks}</b><span>익스</span></div>
        <div><b>${st.fruitPerWeek >= 7 ? '매일' : `주${st.fruitPerWeek}`}</b><span>과일 1cm</span></div>
      </div>
      ${st.worm ? `<p class="small" style="margin:10px 0 0">+ 주 ${st.wormPerWeek}회 ${esc(st.worm)}</p>` : ''}
      ${tr ? `<p class="small" style="margin:4px 0 0">케이지 안 <b>${tr.min}~${tr.max}°C</b> · 습도 <b>${G().humid.min}~${G().humid.max}%</b></p>` : ''}
    </div>` : `
    <div class="page small">${CARE ? '나이를 알 수 없어서 가이드를 못 보여 드려요. ⚙️ 설정에서 입양일이나 생일을 넣어 주세요.' : '케어시트 탭에서 앱 키를 넣으면 주차별 식단 가이드와 배부름 하트가 열려요.'}</div>`}

    <div class="page">
      <p class="h-hand" style="margin-bottom:4px">챙길 것</p>
      ${rem.map((r, i) => `
        <div class="todo">
          <div class="ico ${r.lv}">${img(icon(TODO_ICON[r.ico] || 'q', 3))}</div>
          <div class="grow"><b>${esc(r.h)}</b><span>${esc(r.s)}</span></div>
          ${r.capture ? `<button class="btn sm" data-capture="${i}">캡처함</button>` : ''}
        </div>`).join('')}
    </div>
  `;

  const gImg = $('#geumi img');
  const bubble = $('#bubble');
  let moodT, tipI = Math.floor(Math.random() * tips.length), petI = 0, awake = !sleeping;
  const setMood = (m) => { gImg.src = geumi(m); };
  const say = (s) => { bubble.textContent = s; replay(bubble, 'pop'); };
  const later = (ms = 1100) => { clearTimeout(moodT); moodT = setTimeout(() => setMood(moodNow()), ms); };
  const undo = [];
  const undoBtn = $('#undo');

  const refreshRow = (k, animate) => {
    const row = $('#row-' + k);
    row.innerHTML = rowHTML(k);
    if (animate) { replay($('img:last-child', $('#sl-' + k)), 'stampin'); replay($('#ct-' + k), 'pop'); }
  };
  const checkFull = (wasFull) => {
    $('#hearts').innerHTML = heartsHTML();
    const s = feedState(e, goals);
    const stamp = $('#doneStamp');
    stamp.hidden = !s.full;
    if (s.full && !wasFull) {
      replay(stamp, 'bang'); $('#geumi').classList.add('shine');
      setTimeout(() => { setMood('full'); say('배불러… 오늘 식단 완료!'); }, 50);
      const [x, y] = center(stamp); burst(x, y, [icon('heart', 3), sticker('fruchu', 2), sticker('milpro', 2)], 12);
    }
    if (!s.full) $('#geumi').classList.remove('shine');
  };

  $('.stkgrid', root).addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.stk'); if (!btn) return;
    const k = btn.dataset.k;
    replay(btn, 'peel');
    if (k === 'water' && e.water) { say('오늘 물은 벌써 갈았어요'); return; }
    if (k === 'clean' && (e.clean || []).length >= CLEAN.length) { say('오늘 청소는 다 했어요!'); return; }
    const wasFull = feedState(e, goals).full;
    const before = { water: e.water, clean: [...(e.clean || [])], [k]: e[k] };
    undo.push({ k, before }); undoBtn.hidden = false;
    let added = '';
    if (k === 'water') e.water = true;
    else if (k === 'clean') { added = CLEAN.find((c) => !e.clean.includes(c)); e.clean = [...e.clean, added]; }
    else e[k] = +((num(e[k]) || 0) + (k === 'iks' && st && st.iks % 1 ? 0.5 : 1)).toFixed(1);
    await putEntry(e); flashSaved('savedToday');
    const v = stickerVal(e, k), g = goals[k];
    const food = !['water', 'clean'].includes(k);
    if (food) {
      await fly(sticker(k, 5), $('img', btn), $('#mouth'), 44, 380);
      setMood('eat'); replay(gImg, 'chew'); awake = true;
      say(g && v > g ? `${v}개째예요. 가이드는 ${g}개, 넣어준 만큼 적어 둘게요` : `${LINES[k]} ${k === 'worm' ? `${v}마리째` : `${v}개째`}`);
      later(850);
    } else {
      await fly(sticker(k, 5), $('img', btn), $('#sl-' + k), 44, 0);
      say(k === 'clean' ? `${added} 완료! ${LINES.clean}` : LINES.water);
      setMood('happy'); replay(gImg, 'hop'); awake = true; later(1200);
    }
    refreshRow(k, true);
    checkFull(wasFull);
  });

  undoBtn.onclick = async () => {
    const last = undo.pop(); if (!last) return;
    Object.assign(e, last.before);
    await putEntry(e); flashSaved('savedToday');
    refreshRow(last.k); checkFull(true);
    if (!feedState(e, goals).full) setMood('idle');
    undoBtn.hidden = !undo.length;
    toast(`${label(last.k)} 스티커를 뗐어요`);
  };

  $('#geumi').onclick = () => {
    replay(gImg, 'hop');
    if (!awake) { awake = true; setMood('happy'); say('…응? 깼다! ' + tips[tipI++ % tips.length]); }
    else { setMood('happy'); say(Math.random() < 0.5 ? PET_LINES[petI++ % PET_LINES.length] : tips[tipI++ % tips.length]); }
    const [x, y] = center(gImg); hearts(x, y - 30, 4);
    later(1400);
  };

  let wt;
  $('#wtToday').oninput = (ev) => {
    clearTimeout(wt);
    wt = setTimeout(async () => { e.weight = num(ev.target.value); await putEntry(e); flashSaved('savedToday'); }, 450);
  };

  $$('[data-capture]', root).forEach((b) => b.onclick = async () => {
    const [x, y] = center(b);
    const mk = monthKey(t);
    const r = E.get(retroId(mk, p.id)) || { id: retroId(mk, p.id), kind: '회고', date: `${mk}-01`, pet: p.name, petId: p.id, memo: '', capture: false };
    r.capture = true; await putEntry(r);
    burst(x, y, [icon('heart', 3), icon('check', 2)], 10);
    toast('이번 달 보증 캡처 체크!');
    setTimeout(() => viewToday(root), 600);
  });
}

/* ───────────────────────── 기록 ───────────────────────── */
const CHECKS = [
  ['water', '급수기 물 교체', ''], ['iksNew', '익스 새로 교체', '똥 · 물러짐'], ['feedReset', '사료 전체 교체', '남은 사료까지'],
  ['honey', '꿀 · 젤리 대롱', ''], ['supp:칼슘', '칼슘', '주 1회'], ['supp:비타민', '비타민', '주 1회'],
];
const isChecked = (e, k) => (k.startsWith('supp:') ? (e.supp || []).includes(k.slice(5)) : !!e[k]);

function viewLog(root) {
  const p = pet();
  const date = routeState.logDate;
  const e = structuredClone(getEntry(date, p));
  for (const k of ['fruitKinds', 'supp', 'clean']) e[k] = e[k] || [];
  const w = weeksOld(p, date);
  const st = stageFor(w);
  const tr = tempFor(w);
  const prevW = petEntries(p).find((x) => x.date < date && x.weight)?.weight;
  const ws = weekStart(date);
  const strip = [...Array(7)].map((_, i) => addDays(ws, i));
  const adaptN = G()?.adaptDays || 3;
  const adapting = p.adopt && diffDays(date, p.adopt) >= 0 && diffDays(date, p.adopt) < adaptN;
  const fruits = [...new Set([...FRUITS(), ...e.fruitKinds])];
  const d0 = parse(date);

  const FOODS = [
    ['milpro', '밀프로', st ? `가이드 ${st.milpro}개` : '개수', 1],
    ['fruchu', '후르츄', st ? `가이드 ${st.fruchu}개` : '과일사료 개수', 1],
    ['worm', e.wormType || '왁스웜', st?.worm ? `주 ${st.wormPerWeek}회 · ${st.worm}` : '마리', 1],
    ['iks', '익스', '넣어준 개수 (반 개 = 0.5)', 0.5],
    ['fruit', '과일 큐브', '1cm 큐브 개수', 1],
  ];

  root.innerHTML = `
    <div class="page">
      <div class="datebar">
        <button class="key" id="prevDay" aria-label="전날">${SVG_PREV}</button>
        <input type="date" id="logDate" value="${date}" max="${addDays(today(), 1)}" aria-label="날짜">
        <button class="key" id="nextDay" aria-label="다음날">${SVG_NEXT}</button>
      </div>
      <div class="week">${strip.map((d) => `<button class="day ${d === date ? 'on' : ''} ${!isEmpty(getEntry(d, p)) ? 'has' : ''}" data-d="${d}" aria-label="${fmtDate(d)}"><span>${DOW[parse(d).getDay()]}</span><b>${parse(d).getDate()}</b></button>`).join('')}</div>
    </div>

    <div class="page">
      <div class="sec-title"><span class="tape blue">${d0.getMonth() + 1}월 ${d0.getDate()}일 한눈에</span>${savedChip('savedLog')}</div>
      <div class="glance" id="glance"></div>
      <p class="small muted" style="margin:8px 2px 0">${w != null ? `생후 ${w}주${st ? ` · ${esc(st.label)}` : ''} · ` : ''}칸을 누르면 그 항목으로 가요. 입력하면 바로 저장돼요.</p>
    </div>

    <form id="logForm" autocomplete="off" onsubmit="return false">
    <div class="page" id="sec-food">
      <div class="sec-title"><p class="h-hand">넣어준 양</p>${st ? '<button type="button" class="btn sm white" id="fillGuide">가이드대로</button>' : '<span class="small muted">먹은 양 말고 넣어준 양</span>'}</div>
      ${FOODS.map(([k, l, s, step]) => `<div class="srow">${img(sticker(k, 3))}<span class="lb"><span id="lb-${k}">${esc(l)}</span><small>${esc(s)}</small></span>${stepper(k, e[k], step, l)}</div>`).join('')}
      <div class="seg" id="wormType" style="margin-top:8px"><span class="small muted" style="margin-right:4px">웜 종류</span>${WORMS.map((x) => `<button type="button" data-v="${x}" class="${(e.wormType || '왁스웜') === x ? 'on' : ''}">${x}</button>`).join('')}</div>
      <p class="small muted" style="margin:12px 0 6px">과일 종류</p>
      <div class="chips" id="fruitKinds">${fruits.map((f) => `<button type="button" class="chip ${e.fruitKinds.includes(f) ? 'on' : ''}" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div>
    </div>

    <div class="page" id="sec-check">
      <p class="h-hand" style="margin-bottom:8px">오늘 챙긴 것</p>
      <div class="checks" id="checks"></div>
    </div>

    <div class="page" id="sec-mood">
      <div class="sec-title"><p class="h-hand">컨디션</p><span class="small muted">활력 · 털 윤기 · 몸매</span></div>
      <div class="moods" id="moods"></div>
    </div>

    <div class="page" id="sec-env">
      <div class="sec-title"><p class="h-hand">몸무게 · 온도 · 습도</p>${tr ? `<span class="ctag">${tr.min}~${tr.max}°C · ${G().humid.min}~${G().humid.max}%</span>` : ''}</div>
      <div class="env">
        <div class="field wide"><label for="f-weight">몸무게</label><input id="f-weight" name="weight" type="number" inputmode="decimal" step="0.1" placeholder="--" value="${e.weight ?? ''}"><span class="ex">g</span></div>
        <div class="field"><label for="f-temp">온도</label><input id="f-temp" name="temp" type="number" inputmode="decimal" step="0.1" placeholder="--" value="${e.temp ?? ''}"><span class="ex">°C</span></div>
        <div class="field"><label for="f-humid">습도</label><input id="f-humid" name="humid" type="number" inputmode="numeric" placeholder="--" value="${e.humid ?? ''}"><span class="ex">%</span></div>
      </div>
      <div class="hint ok" id="weightDiff" hidden></div>
      <div class="hint" id="tempHint" hidden></div>
      <div class="hint" id="humidHint" hidden></div>
    </div>

    <div class="page" id="sec-clean">
      <div class="sec-title"><p class="h-hand">청소</p><span class="small muted">간단하게라도 했다면 콕</span></div>
      <div class="tags" id="cleanTags">${CLEAN.map((c) => `<button type="button" class="tag ${e.clean.includes(c) ? 'on' : ''}" data-v="${esc(c)}" aria-pressed="${e.clean.includes(c)}"><i></i>${esc(c)}</button>`).join('')}</div>
    </div>

    <div class="page" id="sec-hand">
      <div class="srow">${img(icon('hand', 3))}<span class="lb">핸들링 횟수<small>${adapting ? '적응기간이라 쉬어요' : '1시간 간격 5~10분, 하루 5회 이상'}</small></span>${stepper('handling', e.handling, 1, '핸들링')}</div>
      ${adapting ? `<div class="hint bad">입양 후 ${adaptN}일은 핸들링 금지예요.</div>` : ''}
    </div>

    <div class="page" id="sec-photo">
      <div class="sec-title"><p class="h-hand">사진 · 영상</p><button type="button" class="btn sm white" id="weightPhoto">${img(icon('camera', 2))}저울 사진</button></div>
      <div class="thumbs" id="thumbs"></div>
      <p class="small muted" style="margin:8px 0 0">영상은 ${S.maxVideoMB}MB까지 노션에 올라가요.</p>
      <input type="file" id="mediaInput" accept="image/*,video/*" multiple hidden>
    </div>

    <div class="page" id="sec-memo">
      <label class="h-hand" for="f-memo">메모</label>
      <textarea class="memo" id="f-memo" name="memo" placeholder="오늘 ${esc(p.name)}는 어땠나요? 행동, 똥 상태…">${esc(e.memo)}</textarea>
    </div>
    </form>
  `;

  const form = $('#logForm');
  let saveT;
  const save = (pulse) => {
    clearTimeout(saveT);
    saveT = setTimeout(async () => { await putEntry(e); flashSaved('savedLog'); }, 350);
    renderGlance(pulse); hints();
  };

  const renderGlance = (pulse) => {
    const foods = [['milpro', '밀프로'], ['fruchu', '후르츄'], ['worm', e.wormType || '웜'], ['iks', '익스'], ['fruit', '과일']]
      .map(([k, l]) => `<div>${img(sticker(k, 3))}${e[k] ?? 0}<span>${esc(l)}</span></div>`).join('');
    const ch = CHECKS.filter(([k]) => isChecked(e, k)).map((c) => c[1]);
    const tile = (go, key, cls, inner) => `<button type="button" class="gt ${cls} ${pulse === key ? 'pulse' : ''}" data-go="${go}">${inner}</button>`;
    const n = mediaFor(e.id).length;
    $('#glance').innerHTML =
      tile('sec-food', 'food', 'wide', `<span class="k">넣어준 양</span><div class="foods">${foods}</div>`)
      + tile('sec-mood', 'mood', '', `<span class="k">컨디션</span><div class="face">${img(geumi(MOOD_OF[e.condition] || 'idle', 2))}<span class="v ${e.condition ? '' : 'off'}">${e.condition || '아직'}</span></div>`)
      + tile('sec-env', 'env', '', `<span class="k">몸무게</span><span class="v ${e.weight ? '' : 'off'}">${e.weight ? `${e.weight} g` : '아직'}</span><span class="k" style="margin-top:2px">온도 · 습도</span><span class="v ${e.temp || e.humid ? '' : 'off'}">${e.temp ?? '--'}°C · ${e.humid ?? '--'}%</span>`)
      + tile('sec-check', 'check', '', `<span class="k">챙긴 것<b>${ch.length}/${CHECKS.length}</b></span><span class="v ${ch.length ? '' : 'off'}">${ch.length ? ch.map(esc).join(', ') : '아직 없어요'}</span>`)
      + tile('sec-clean', 'clean', '', `<span class="k">청소<b>${e.clean.length}</b></span><span class="v ${e.clean.length ? '' : 'off'}">${e.clean.length ? e.clean.map(esc).join(', ') : '아직 없어요'}</span>`)
      + tile('sec-photo', 'photo', '', `<span class="k">사진 · 핸들링</span><span class="v ${n || e.handling ? '' : 'off'}">사진 ${n}장 · 핸들링 ${e.handling || 0}회</span>`)
      + tile('sec-memo', 'memo', 'wide', `<span class="k">메모</span><span class="v ${e.memo ? '' : 'off'}" style="font-family:var(--hand);font-size:18px;font-weight:400">${e.memo ? esc(e.memo.length > 60 ? e.memo.slice(0, 60) + '…' : e.memo) : '한 줄 남겨 보세요'}</span>`);
  };
  $('#glance').addEventListener('click', (ev) => {
    const b = ev.target.closest('.gt'); if (!b) return;
    const tgt = $('#' + b.dataset.go);
    tgt.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    replay(tgt, 'pop');
  });

  const renderChecks = () => {
    $('#checks').innerHTML = CHECKS.map(([k, l, s]) => {
      const on = isChecked(e, k);
      return `<button type="button" class="chk ${on ? 'on' : ''}" data-k="${k}" aria-pressed="${on}"><span class="box">${on ? img(icon('check', 2)) : ''}</span><span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`;
    }).join('');
  };
  $('#checks').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chk'); if (!b) return;
    const k = b.dataset.k;
    if (k.startsWith('supp:')) { const n = k.slice(5); e.supp = e.supp.includes(n) ? e.supp.filter((x) => x !== n) : [...e.supp, n]; }
    else e[k] = !e[k];
    renderChecks(); save('check');
  });

  const renderMoods = (hop) => {
    $('#moods').innerHTML = CONDS.map(([k, s]) => `<button type="button" class="mood ${e.condition === k ? 'on' : ''}" data-v="${k}" aria-pressed="${e.condition === k}">${img(geumi(MOOD_OF[k], 3))}<b class="small">${k}</b><small>${s}</small></button>`).join('');
    if (hop) replay($(`.mood[data-v="${hop}"] img`), 'hop');
  };
  $('#moods').addEventListener('click', (ev) => {
    const b = ev.target.closest('.mood'); if (!b) return;
    e.condition = e.condition === b.dataset.v ? '' : b.dataset.v;
    renderMoods(e.condition);
    if (e.condition) { const [x, y] = center(b); hearts(x, y - 20, 2); }
    save('mood');
  });

  const hints = () => {
    const wd = $('#weightDiff');
    if (e.weight && prevW) { const d = +(e.weight - prevW).toFixed(1); wd.textContent = d === 0 ? `지난번(${prevW}g)과 같아요` : `지난번 ${prevW}g보다 ${d > 0 ? '+' : ''}${d}g`; wd.hidden = false; }
    else wd.hidden = true;
    const th = $('#tempHint');
    if (e.temp != null && tr) {
      const ok = e.temp >= tr.min && e.temp <= tr.max;
      th.className = `hint ${ok ? 'ok' : 'bad'}`;
      th.textContent = ok ? '적정 온도예요' : e.temp < tr.min ? `낮아요. ${tr.min}~${tr.max}°C로 올려 주세요` : `높아요. 에어컨 · 선풍기로 ${tr.max}°C 아래로`;
      th.hidden = false;
    } else th.hidden = true;
    const hh = $('#humidHint'), hg = G()?.humid;
    if (e.humid != null && hg) {
      hh.className = `hint ${e.humid <= hg.max ? 'ok' : 'bad'}`;
      hh.textContent = e.humid <= hg.max ? '습도 좋아요' : e.humid <= hg.soft ? '조금 높지만 바로 위험하진 않아요. 온도를 먼저 챙겨요' : '높아요. 제습제 · 제습기 · 베딩 교체로 낮춰요';
      hh.hidden = false;
    } else hh.hidden = true;
  };

  const KEY_OF = { milpro: 'food', fruchu: 'food', worm: 'food', iks: 'food', fruit: 'food', weight: 'env', temp: 'env', humid: 'env', handling: 'photo', memo: 'memo' };
  form.addEventListener('input', (ev) => {
    const n = ev.target.name; if (!n) return;
    e[n] = n === 'memo' ? ev.target.value : num(ev.target.value);
    save(KEY_OF[n]);
  });
  $$('.stepper', form).forEach((s) => {
    const inp = $('input', s), step = +s.dataset.step;
    $$('.key', s).forEach((b) => b.onclick = () => {
      const v = Math.max(0, +((num(inp.value) || 0) + step * +b.dataset.d).toFixed(1));
      inp.value = v || '';
      e[inp.name] = v || null;
      replay(s, 'bump');
      if (+b.dataset.d > 0 && FOODS.some((f) => f[0] === inp.name)) { const [x, y] = center(b); burst(x, y, [sticker(inp.name, 2)], 4); }
      save(KEY_OF[inp.name]);
    });
  });
  $('#wormType').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    e.wormType = b.dataset.v;
    $$('#wormType button').forEach((x) => x.classList.toggle('on', x === b));
    $('#lb-worm').textContent = e.wormType;
    save('food');
  });
  $('#fruitKinds').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    const v = b.dataset.v;
    e.fruitKinds = e.fruitKinds.includes(v) ? e.fruitKinds.filter((x) => x !== v) : [...e.fruitKinds, v];
    b.classList.toggle('on');
    save('food');
  });
  $('#cleanTags').addEventListener('click', (ev) => {
    const b = ev.target.closest('.tag'); if (!b) return;
    const v = b.dataset.v;
    e.clean = e.clean.includes(v) ? e.clean.filter((x) => x !== v) : [...e.clean, v];
    b.classList.toggle('on'); b.setAttribute('aria-pressed', e.clean.includes(v));
    save('clean');
  });
  $('#fillGuide')?.addEventListener('click', () => {
    e.milpro = st.milpro; e.fruchu = st.fruchu; e.iks = st.iks;
    if (st.fruitPerWeek >= 7 && !e.fruit) e.fruit = st.fruit || 1;
    for (const k of ['milpro', 'fruchu', 'iks', 'fruit']) form.elements[k].value = e[k] ?? '';
    $$('.stepper', form).forEach((s) => replay(s, 'bump'));
    save('food'); toast(`${st.label} 가이드로 채웠어요`);
  });

  // 사진
  let pendingTag = '';
  const renderThumbs = () => {
    const list = mediaFor(e.id);
    $('#thumbs').innerHTML = list.map((m) => `<button type="button" class="thumb" data-m="${m.id}">${m.thumb ? `<img src="${blobURL(m)}" alt="">` : ''}${m.type === 'video' ? '<span class="badge">영상</span>' : m.tag ? `<span class="badge">${esc(m.tag)}</span>` : ''}${connected() ? `<span class="st ${m.status === 'synced' ? 'ok' : m.status === 'error' ? 'err' : ''}"></span>` : ''}</button>`).join('')
      + `<button type="button" class="addmedia" id="addMedia">${img(icon('plus', 4))}사진 · 영상</button>`;
    $('#addMedia').onclick = () => { pendingTag = ''; $('#mediaInput').click(); };
    $$('.thumb', $('#thumbs')).forEach((tb) => tb.onclick = () => openLight(M.get(tb.dataset.m), () => { renderThumbs(); renderGlance(); }));
  };
  $('#weightPhoto').onclick = () => { pendingTag = '몸무게'; $('#mediaInput').click(); };
  $('#mediaInput').onchange = async (ev) => {
    clearTimeout(saveT); await putEntry(e);
    const n = await addMedia([...ev.target.files], e, pendingTag);
    ev.target.value = '';
    if (n) { renderThumbs(); renderGlance('photo'); flashSaved('savedLog'); toast(`${n}개 붙였어요`); }
  };

  // 날짜 이동
  const go = (d) => { routeState.logDate = d; location.hash = `#/log/${d}`; };
  $('#logDate').onchange = (ev) => ev.target.value && go(ev.target.value);
  $('#prevDay').onclick = () => go(addDays(date, -1));
  $('#nextDay').onclick = () => go(addDays(date, 1));
  $$('.week .day', root).forEach((b) => b.onclick = () => go(b.dataset.d));

  renderGlance(); renderChecks(); renderMoods(); hints(); renderThumbs();
}

/* ───────────────────────── 사진 크게 보기 ───────────────────────── */
function openLight(m, after) {
  const lb = document.createElement('div');
  lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', '사진 크게 보기');
  const src = m.remote ? m.url : blobURL(m, m.view ? 'view' : m.blob ? 'blob' : 'thumb');
  const isVideo = m.type === 'video';
  const playable = isVideo && (m.blob || m.url);
  const cap = `${mmdd(m.date)}${m.tag ? ` · ${m.tag}` : ''}`;
  const note = [isVideo && !playable ? '영상 원본은 노션에 있어요' : '', m.status === 'error' ? `업로드 실패: ${m.error}` : '', m.remote ? '노션에서 불러온 사진이에요' : m.status === 'synced' ? '노션에 올라갔어요' : connected() ? '노션에 올리는 중이에요' : ''].filter(Boolean).join(' · ');
  const drawBox = () => `
    ${!m.remote ? `<p>폴더에 넣기</p><div class="chips">${['없음', ...S.folders].map((f) => `<button type="button" class="chip ${(f === '없음' ? !m.folder : m.folder === f) ? 'on' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
    ${note ? `<p style="margin:8px 0 0">${esc(note)}</p>` : ''}`;
  lb.innerHTML = `<div class="lb-panel">
      <div class="pol"><div class="ph">${playable ? `<video src="${esc(src)}" controls playsinline autoplay></video>` : src ? `<img src="${esc(src)}" alt="">` : ''}</div><small>${esc(cap)}</small></div>
      <div class="lb-box" id="lbBox">${drawBox()}</div>
      <div class="row" style="justify-content:center">
        ${!m.remote ? '<button type="button" class="btn sm white" data-del>이 기기에서 지우기</button>' : ''}
        <button type="button" class="btn sm" data-close>닫기</button>
      </div></div>`;
  document.body.appendChild(lb);
  replay($('.pol', lb), 'pop');
  const close = () => lb.remove();
  lb.addEventListener('click', async (ev) => {
    if (ev.target === lb || ev.target.closest('[data-close]')) { close(); return; }
    const f = ev.target.closest('[data-f]');
    if (f) {
      m.folder = f.dataset.f === '없음' ? '' : f.dataset.f;
      await db.put('media', m);
      $('#lbBox', lb).innerHTML = drawBox();
      toast(m.folder ? `"${m.folder}" 폴더로 옮겼어요` : '폴더에서 뺐어요');
      after?.();
      return;
    }
    const del = ev.target.closest('[data-del]');
    if (del) {
      if (!del.dataset.sure) {
        del.dataset.sure = '1';
        del.textContent = m.status === 'synced' ? '한 번 더 누르면 지워요 (노션엔 남아요)' : '아직 노션에 없어요. 한 번 더 누르면 지워요';
        return;
      }
      M.delete(m.id); await db.del('media', m.id); close(); after?.();
    }
  });
}

/* ───────────────────────── 앨범 ───────────────────────── */
let remoteAlbum = [];
function viewAlbum(root) {
  const p = pet();
  const local = [...M.values()].filter((m) => m.petId === p.id);
  const known = new Set(local.map((m) => m.blockId).filter(Boolean));
  const remote = remoteAlbum.filter((r) => !known.has(r.blockId) && S.pets.find((x) => x.name === r.pet)?.id === p.id)
    .map((r) => ({ ...r, id: 'r_' + r.blockId, remote: true }));
  const all = [...local, ...remote].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  let cur = routeState.folder;
  if (cur && !S.folders.includes(cur)) cur = routeState.folder = null;
  const shown = cur ? all.filter((m) => m.folder === cur) : all;
  const byDay = shown.reduce((acc, m) => ((acc[m.date] ||= []).push(m), acc), {});
  const fIcon = img(icon('folder', 2));

  const polHTML = (m) => {
    const src = m.remote ? (m.type === 'image' ? m.url : '') : m.thumb ? blobURL(m) : '';
    return `<button type="button" class="pol" data-m="${m.id}"><div class="ph">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : img(icon('camera', 4))}</div>
      ${m.type === 'video' ? '<span class="badge">영상</span>' : m.tag ? `<span class="badge">${esc(m.tag)}</span>` : ''}
      ${m.folder && !cur ? `<span class="fdtag">${esc(m.folder)}</span>` : ''}
      <small>${mmdd(m.date)}${m.remote ? ' · 노션' : ''}</small></button>`;
  };

  root.innerHTML = `
    <div class="page">
      <div class="sec-title"><span class="tape pink">${esc(p.name)} 앨범</span><span class="ex">${all.length} PHOTOS</span></div>
      <div class="folders" id="folders">
        <button type="button" class="fd ${cur ? '' : 'on'}" data-f="">${fIcon}전체 <b>${all.length}</b></button>
        ${S.folders.map((f) => `<button type="button" class="fd ${cur === f ? 'on' : ''}" data-f="${esc(f)}">${fIcon}${esc(f)} <b>${all.filter((m) => m.folder === f).length}</b></button>`).join('')}
        <button type="button" class="fd add" data-add="1">+ 새 폴더</button>
      </div>
      <form class="newfolder" id="newFolder" hidden><input id="folderName" maxlength="20" placeholder="폴더 이름 (예: 몸무게, 첫 핸들링)" aria-label="새 폴더 이름"><button class="btn sm">만들기</button></form>
      <div class="row" style="margin-top:12px">
        <label class="btn blue grow" for="albumInput">${img(icon('camera', 2))}${cur ? `"${esc(cur)}"에 붙이기` : '오늘 사진 · 영상 붙이기'}</label>
        <input type="file" id="albumInput" accept="image/*,video/*" multiple hidden>
        ${connected() ? '<button type="button" class="btn sm white" id="pullAlbum">노션에서 불러오기</button>' : ''}
      </div>
    </div>
    ${shown.length ? Object.entries(byDay).map(([d, list]) => `
      <div class="album-day">${fmtDate(d)}</div>
      <div class="album">${list.map(polHTML).join('')}</div>`).join('')
    : `<div class="page empty">${img(geumi('sleep'))}${cur ? `"${esc(cur)}" 폴더가 비어 있어요.<br>사진을 열고 "폴더에 넣기"를 눌러 보세요.` : '아직 사진이 없어요.<br>여기서 붙이거나 기록할 때 사진을 넣으면 모여요.'}</div>`}
  `;

  $('#folders').addEventListener('click', (ev) => {
    const b = ev.target.closest('.fd'); if (!b) return;
    if (b.dataset.add) { const nf = $('#newFolder'); nf.hidden = !nf.hidden; if (!nf.hidden) $('#folderName').focus(); return; }
    routeState.folder = b.dataset.f || null; viewAlbum(root);
  });
  $('#newFolder').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const n = $('#folderName').value.trim(); if (!n) return;
    if (!S.folders.includes(n)) { S.folders.push(n); saveSettings(); }
    routeState.folder = n; toast(`"${n}" 폴더를 만들었어요`); viewAlbum(root);
  });
  $('#albumInput').onchange = async (ev) => {
    const e = getEntry(today(), p);
    const n = await addMedia([...ev.target.files], e, '', routeState.folder || '');
    ev.target.value = '';
    if (n) {
      toast(routeState.folder ? `"${routeState.folder}"에 ${n}장 붙였어요` : `앨범에 ${n}장 붙였어요`);
      viewAlbum(root); replay($('.pol', root), 'stampin');
    }
  };
  $$('.pol', root).forEach((b) => b.onclick = () => {
    const id = b.dataset.m;
    openLight(M.get(id) || all.find((x) => x.id === id), () => viewAlbum(root));
  });
  $('#pullAlbum')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.textContent = '불러오는 중…';
    try {
      const r = await api(`/album?from=${addDays(today(), -400)}`);
      remoteAlbum = r.items; toast(`노션에서 ${r.items.length}개 확인했어요`);
    } catch (err) { toast(`불러오기 실패: ${err.message}`); }
    viewAlbum(root);
  });
}

/* ───────────────────────── 월간 회고 ───────────────────────── */
function lineChart(points, { h = 120, color = '#5f86d6', band } = {}) {
  if (points.length < 1) return '<p class="small muted" style="margin:6px 0 0">이번 달 기록이 없어요</p>';
  const W = 320, P = 22;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys, band?.[0] ?? Infinity), max = Math.max(...ys, band?.[1] ?? -Infinity);
  if (min === max) { min -= 1; max += 1; }
  const days = points[0].days;
  const X = (d) => P + ((d - 1) / Math.max(1, days - 1)) * (W - P * 1.5);
  const Y = (v) => h - 18 - ((v - min) / (max - min)) * (h - 34);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">
    ${band ? `<rect x="${P}" width="${W - P * 1.5}" y="${Y(band[1])}" height="${Y(band[0]) - Y(band[1])}" fill="#e2eefa"/>` : ''}
    <line x1="${P}" x2="${W - P / 2}" y1="${h - 18}" y2="${h - 18}" stroke="#bfd6ec"/>
    <text x="0" y="${Y(max) + 3}">${+max.toFixed(1)}</text><text x="0" y="${Y(min) + 3}">${+min.toFixed(1)}</text>
    ${[1, 8, 15, 22, 29].filter((d) => d <= days).map((d) => `<text x="${X(d) - 3}" y="${h - 4}">${d}</text>`).join('')}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
    ${points.map((p) => `<rect x="${X(p.x) - 3}" y="${Y(p.y) - 3}" width="6" height="6" fill="${color}" stroke="${O}" stroke-width="1"/>`).join('')}
  </svg>`;
}
function barChart(rows, days, h = 110) {
  const W = 320, P = 22, bw = (W - P * 1.5) / days;
  const max = Math.max(1, ...rows.map((r) => r.a + r.b));
  const Y = (v) => ((h - 30) * v) / max;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">
    <line x1="${P}" x2="${W - P / 2}" y1="${h - 18}" y2="${h - 18}" stroke="#bfd6ec"/>
    <text x="0" y="12">${max}</text>
    ${rows.map((r) => {
      const x = P + (r.x - 1) * bw + 1;
      return `<rect x="${x}" width="${bw - 2}" y="${h - 18 - Y(r.a)}" height="${Y(r.a)}" fill="#c99a5b"/>
              <rect x="${x}" width="${bw - 2}" y="${h - 18 - Y(r.a) - Y(r.b)}" height="${Y(r.b)}" fill="#f3aeb5"/>
              ${r.w ? `<rect x="${x + bw / 2 - 2}" width="4" y="${h - 18 - Y(r.a) - Y(r.b) - 7}" height="4" fill="${O}"/>` : ''}`;
    }).join('')}
    ${[1, 8, 15, 22, 29].filter((d) => d <= days).map((d) => `<text x="${P + (d - 1) * bw}" y="${h - 4}">${d}</text>`).join('')}
  </svg>`;
}

const n1 = (v) => +(+v).toFixed(1);
function dayFood(e) {
  return [
    e.milpro && `밀프로 ${n1(e.milpro)}개`, e.fruchu && `후르츄 ${n1(e.fruchu)}개`,
    e.worm && `${esc(e.wormType || '왁스웜')} ${n1(e.worm)}마리`, e.iks && `익스 ${n1(e.iks)}개`,
    e.fruit && `과일 큐브 ${n1(e.fruit)}개${e.fruitKinds?.length ? ` (${e.fruitKinds.map(esc).join(', ')})` : ''}`,
    e.honey && '꿀 · 젤리',
  ].filter(Boolean);
}
function dayDone(e) {
  return [
    e.water && '물 교체', e.iksNew && '익스 교체', e.feedReset && '사료 전체 교체',
    ...(e.supp || []).map(esc), ...(e.clean || []).map(esc), e.handling && `핸들링 ${n1(e.handling)}회`,
  ].filter(Boolean);
}
// 인쇄용: 기록한 날마다 식사 · 한 일 · 몸 상태 · 메모
function dayCard(e, photos) {
  const body = [
    ['식사', dayFood(e).join(' · ')], ['한 일', dayDone(e).join(' · ')],
    ['몸 · 환경', [e.weight && `${e.weight} g`, e.temp && `${e.temp}°C`, e.humid && `${e.humid}%`].filter(Boolean).join(' · ')],
    ['사진', photos ? `${photos}장` : ''],
  ].filter(([, v]) => v);
  return `<article class="dayrec">
    <div class="dr-head"><b>${fmtDate(e.date)}</b>${e.condition ? `<span class="ctag ${e.condition === '주의' ? 'danger' : ''}">${esc(e.condition)}</span>` : ''}</div>
    ${body.map(([l, v]) => `<div class="dr-row"><span class="lb">${l}</span><span class="v">${v}</span></div>`).join('')}
    ${e.memo ? `<p class="dr-memo">${esc(e.memo)}</p>` : ''}
  </article>`;
}

function viewMonth(root) {
  const p = pet();
  const mk = routeState.month;
  const days = monthDays(mk);
  const list = petEntries(p).filter((e) => monthKey(e.date) === mk).sort((a, b) => (a.date > b.date ? 1 : -1));
  const byDate = Object.fromEntries(list.map((e) => [e.date, e]));
  const media = [...M.values()].filter((m) => m.petId === p.id && monthKey(m.date) === mk);
  const mediaDays = new Set(media.map((m) => m.date));
  const first = (parse(`${mk}-01`).getDay() + 6) % 7;
  const retro = E.get(retroId(mk, p.id)) || { id: retroId(mk, p.id), kind: '회고', date: `${mk}-01`, pet: p.name, petId: p.id, memo: '', good: '', bad: '', next: '', capture: false };
  const sum = (k) => list.reduce((a, e) => a + (num(e[k]) || 0), 0);
  const cnt = (f) => list.filter(f).length;
  const weights = list.filter((e) => e.weight).map((e) => ({ x: parse(e.date).getDate(), y: e.weight, days }));
  const temps = list.filter((e) => e.temp).map((e) => ({ x: parse(e.date).getDate(), y: e.temp, days }));
  const tr = tempFor(weeksOld(p, `${mk}-15`));
  const recDays = [...new Set([...list.filter((e) => !isEmpty(e)).map((e) => e.date), ...mediaDays])].sort();
  const recorded = new Set([...list.filter((e) => !isEmpty(e)).map((e) => e.date), ...mediaDays]).size;
  const avg = (k) => { const v = list.map((e) => num(e[k])).filter((x) => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; };
  const wDelta = weights.length >= 2 ? +(weights.at(-1).y - weights[0].y).toFixed(1) : null;
  const t = today();
  const [y, m] = mk.split('-').map(Number);
  const w0 = weeksOld(p, `${mk}-${pad(days)}`);
  const MINI = { food: sticker('milpro', 1), water: sticker('water', 1), clean: sticker('clean', 1), photo: icon('camera', 2), worry: icon('ban', 2) };
  const ledger = [
    ['기록한 날', `${recorded} / ${days}일`], ['몸무게 변화', wDelta == null ? '-' : `${wDelta > 0 ? '+' : ''}${wDelta} g`],
    ['물 교체', `${cnt((e) => e.water)}회`], ['청소한 날', `${cnt((e) => e.clean?.length)}일`],
    ['웜 급여', `${cnt((e) => e.worm > 0)}회 · ${sum('worm')}마리`], ['과일 큐브', `${cnt((e) => e.fruit > 0)}회`],
    ['칼슘 · 비타민', `${cnt((e) => e.supp?.includes('칼슘'))}회 · ${cnt((e) => e.supp?.includes('비타민'))}회`], ['핸들링', `${sum('handling')}회`],
    ['평균 온도', `${avg('temp')} °C`], ['평균 습도', `${avg('humid')} %`], ['주의한 날', `${cnt((e) => e.condition === '주의')}일`],
  ];

  root.innerHTML = `
    <div class="mprint">
    <div class="print-only m-head"><b>금이로그 · 월간 기록</b><span>${esc(p.name)} · ${y}년 ${m}월${w0 != null ? ` · 생후 ${w0}주` : ''}</span></div>
    <div class="page m-cal">
      <div class="mhead">
        <button class="key no-print" id="prevM" aria-label="이전 달">${SVG_PREV}</button>
        <span class="tape">${y}년 ${m}월</span>
        <button class="key no-print" id="nextM" aria-label="다음 달">${SVG_NEXT}</button>
      </div>
      <div class="cal">
        ${['월', '화', '수', '목', '금', '토', '일'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${[...Array(first)].map(() => '<div class="cell blank"></div>').join('')}
        ${[...Array(days)].map((_, i) => {
          const d = `${mk}-${pad(i + 1)}`; const e = byDate[d];
          const marks = e ? [hasFood(e) && 'food', e.water && 'water', e.clean?.length && 'clean', e.condition === '주의' && 'worry'].filter(Boolean) : [];
          if (mediaDays.has(d)) marks.push('photo');
          return `<button type="button" class="cell ${marks.length || (e && !isEmpty(e)) ? 'has' : ''} ${d === t ? 'today' : ''}" data-d="${d}" aria-label="${fmtDate(d)}">${i + 1}<span class="mini">${marks.map((k) => img(MINI[k])).join('')}</span></button>`;
        }).join('')}
      </div>
      <div class="legend">
        <span>${img(MINI.food)}식단</span><span>${img(MINI.water)}물 교체</span><span>${img(MINI.clean)}청소</span><span>${img(MINI.photo)}사진</span><span>${img(MINI.worry)}주의</span>
      </div>
    </div>

    <div class="page ledger m-ledger">
      <div class="sec-title"><p class="h-hand">이번 달 장부</p>
        <span class="row no-print"><button type="button" class="btn sm white" id="printBtn">인쇄 · PDF</button><button type="button" class="btn sm white" id="csvBtn">CSV</button></span></div>
      ${ledger.map(([l, v]) => `<div class="rowline"><span class="lb">${l}</span><span class="dots-fill"></span><span class="v">${v}</span></div>`).join('')}
    </div>

    <div class="page m-chart"><div class="sec-title"><p class="h-hand">몸무게</p><span class="ex">g</span></div>${lineChart(weights, { color: '#e8707c' })}</div>
    <div class="page m-chart"><div class="sec-title"><p class="h-hand">넣어준 사료</p></div>
      ${barChart([...Array(days)].map((_, i) => { const e = byDate[`${mk}-${pad(i + 1)}`]; return { x: i + 1, a: num(e?.milpro) || 0, b: num(e?.fruchu) || 0, w: (e?.worm || 0) > 0 }; }), days)}
      <div class="legend"><span><i style="width:10px;height:10px;background:#c99a5b;display:inline-block"></i>밀프로</span><span><i style="width:10px;height:10px;background:#f3aeb5;display:inline-block"></i>후르츄</span><span><i style="width:6px;height:6px;background:${O};display:inline-block"></i>웜 준 날</span></div></div>
    <div class="page m-chart"><div class="sec-title"><p class="h-hand">케이지 온도</p>${tr ? `<span class="small muted">하늘색 띠 = 적정 ${tr.min}~${tr.max}°C</span>` : ''}</div>${lineChart(temps, { band: tr ? [tr.min, tr.max] : null })}</div>

    <div class="page retro m-retro">
      <div class="sec-title"><span class="tape blue">이번 달 회고</span>${savedChip('savedRetro')}</div>
      ${p.mainRoom ? `<button type="button" class="chk ${retro.capture ? 'on' : ''}" id="capture" style="margin-top:10px;width:100%"><span class="box">${retro.capture ? img(icon('check', 2)) : ''}</span><span>분양보증 본방 캡처 완료<small>본방 이동 후 11개월 동안 매달</small></span></button>` : ''}
      <div class="m-col"><label for="r-good">잘 챙긴 것</label><textarea class="memo" id="r-good" data-r="good" placeholder="물 교체를 한 번도 안 빠뜨렸다">${esc(retro.good)}</textarea>
      <div class="print-only">${esc(retro.good)}</div></div>
      <div class="m-col"><label for="r-bad">아쉬웠던 것 · 걱정</label><textarea class="memo" id="r-bad" data-r="bad" placeholder="습도가 자주 50%를 넘었다">${esc(retro.bad)}</textarea>
      <div class="print-only">${esc(retro.bad)}</div></div>
      <div class="m-col"><label for="r-next">다음 달 목표</label><textarea class="memo" id="r-next" data-r="next" placeholder="핸들링 하루 5회">${esc(retro.next)}</textarea>
      <div class="print-only">${esc(retro.next)}</div></div>
    </div>

    ${list.some((e) => e.memo) ? `<div class="page m-memo"><p class="h-hand" style="margin-bottom:4px">이번 달 메모</p>${list.filter((e) => e.memo).map((e) => `<div class="todo"><div class="ico">${img(geumi(MOOD_OF[e.condition] || 'idle', 1), '', 'width:26px;height:21px')}</div><div class="grow"><b>${fmtDate(e.date)}</b><span style="font-family:var(--hand);font-size:17px;color:var(--ink)">${esc(e.memo)}</span></div></div>`).join('')}</div>` : ''}

    <div class="print-only m-days">
      ${recDays.length ? recDays.map((d) => dayCard(byDate[d] || blankEntry(d, p), media.filter((x) => x.date === d).length)).join('') : '<p>이번 달은 아직 기록이 없어요.</p>'}
    </div>
    </div>
  `;

  $('#prevM').onclick = () => { routeState.month = addMonths(mk, -1); viewMonth(root); };
  $('#nextM').onclick = () => { routeState.month = addMonths(mk, 1); viewMonth(root); };
  $$('.cal .cell[data-d]', root).forEach((b) => b.onclick = () => { location.hash = `#/log/${b.dataset.d}`; });
  $('#printBtn').onclick = () => window.print();
  $('#csvBtn').onclick = () => downloadCSV(list, `geumi-log-${p.name}-${mk}.csv`);
  let rt;
  $$('[data-r]', root).forEach((ta) => ta.oninput = () => {
    retro[ta.dataset.r] = ta.value;
    if (ta.nextElementSibling?.classList.contains('print-only')) ta.nextElementSibling.textContent = ta.value;
    retro.memo = ['잘 챙긴 것: ' + (retro.good || ''), '아쉬운 것: ' + (retro.bad || ''), '다음 달 목표: ' + (retro.next || '')].join('\n');
    clearTimeout(rt); rt = setTimeout(async () => { await putEntry(retro); flashSaved('savedRetro'); }, 500);
  });
  $('#capture')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    retro.capture = !retro.capture; await putEntry(retro); flashSaved('savedRetro');
    b.classList.toggle('on', retro.capture);
    $('.box', b).innerHTML = retro.capture ? img(icon('check', 2)) : '';
    if (retro.capture) { const [x, yy] = center(b); burst(x, yy, [icon('heart', 3), icon('check', 2)], 8); }
  });
}

/* ───────────────────────── 케어시트 ───────────────────────── */
const QUICK = ['온도', '습도', '급수기', '식단', '과일', '밀웜', '영양제', '핸들링', '탈출', '청소', '베딩', '보증'];
function viewCare(root) {
  if (!CARE) {
    root.innerHTML = `
      <div class="page lock" id="lockPage">
        ${img(icon('lock', 6), '', '', '')}
        <p class="h-hand">케어시트가 잠겨 있어요</p>
        <p class="small muted" style="margin:0">드길샵 케어시트는 외부 공유 금지 자료라서<br>금이로그 앱 키로 잠가 두었어요.</p>
        <form class="row" id="unlockForm">
          <input type="password" id="careKey" inputmode="numeric" autocomplete="current-password" value="${esc(S.appKey)}" placeholder="앱 키" aria-label="앱 키">
          <button class="btn">열기</button>
        </form>
        <p class="small muted" style="margin:0">한 번 열면 이 폰이 기억해요.</p>
      </div>`;
    $('#unlockForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const k = $('#careKey').value.trim();
      const btn = $('#unlockForm button'); btn.disabled = true; btn.textContent = '여는 중…';
      try {
        await unlockCare(k);
        S.appKey = S.appKey || k; S.careLocked = false; saveSettings();
        const lk = $('#lockPage > img'); lk.src = icon('lockOpen', 6); replay(lk, 'pop');
        const [x, y] = center(lk); burst(x, y, [icon('heart', 3), sticker('fruit', 2)], 10);
        setTimeout(() => { toast('케어시트를 열었어요'); viewCare(root); }, 650);
      } catch {
        btn.disabled = false; btn.textContent = '열기';
        replay($('#unlockForm'), 'shake'); toast('키가 맞지 않아요');
      }
    };
    return;
  }
  const p = pet();
  const st = stageFor(weeksOld(p));
  root.innerHTML = `
    <div class="page">
      <div class="sec-title"><span class="tape">케어시트 찾아보기</span><span class="ex">${esc(CARE.version || '')}</span></div>
      <div class="search" style="margin-top:8px">${SVG_SEARCH}
        <input type="search" enterkeyhint="search" id="q" placeholder="온도, 밀웜, 탈출…" value="${esc(routeState.q)}" aria-label="케어시트 검색">
        <button type="button" class="link-btn" id="clearQ">지우기</button></div>
      <div class="qchips">${QUICK.map((q) => `<button type="button" class="qchip" data-q="${q}">${q}</button>`).join('')}</div>
    </div>
    ${st ? `<div class="page small"><b>지금 ${esc(p.name)}는 ${esc(st.label)}</b> · 밀프로 ${st.milpro} · 후르츄 ${st.fruchu} · 익스 ${st.iks} · 과일 ${st.fruitPerWeek >= 7 ? '매일' : `주 ${st.fruitPerWeek}회`}${st.worm ? ` · ${esc(st.worm)} 주 ${st.wormPerWeek}회` : ''}</div>` : ''}
    <div id="careList"></div>
    <div class="page small">
      <div class="foot-row"><span>출처</span><b>${esc(CARE.source)}</b></div>
      <div class="foot-row"><span>전화</span><b>${esc(CARE.contact.tel)}</b></div>
      <div class="foot-row"><span>인스타</span><b>${esc(CARE.contact.insta)}</b></div>
      <div class="foot-row"><span>스토어</span><b><a href="${esc(CARE.contact.store)}" target="_blank" rel="noopener">네이버 드길샵</a></b></div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn sm white" id="relock">${img(icon('lock', 2))}다시 잠그기</button></div>
    </div>`;

  const render = () => {
    const q = routeState.q.trim();
    const terms = q.split(/\s+/).filter(Boolean);
    const hl = (s) => {
      let out = esc(s);
      terms.forEach((t) => { out = out.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => `<mark>${m}</mark>`); });
      return out;
    };
    const html = CARE.sections.map((s) => {
      const items = s.items.filter((i) => !terms.length || terms.every((t) => (s.title + i.h + i.t + (i.tags || []).join(' ')).includes(t)));
      if (!items.length) return '';
      const open = terms.length > 0 || routeState.openSec.has(s.id);
      return `<div class="page csec ${open ? 'open' : ''}" data-s="${esc(s.id)}">
        <button type="button" class="csec-h" aria-expanded="${open}">${img(icon(s.icon, 3))}<b>${hl(s.title)}</b><span class="n">${items.length}</span><span class="car"></span></button>
        <div class="csec-b" ${open ? '' : 'hidden'}>${items.map((i) => `<div class="citem"><h4>${hl(i.h)}${(i.tags || []).map((t) => `<span class="ctag ${t === '주의' || t === '금지' ? 'danger' : t === '필수' ? 'yellow' : ''}">${esc(t)}</span>`).join('')}</h4><p>${hl(i.t)}</p></div>`).join('')}</div>
      </div>`;
    }).join('');
    $('#careList').innerHTML = html || `<div class="page empty">${img(geumi('worry'))}'${esc(q)}'에 대한 내용이 없어요.</div>`;
    $$('.qchip', root).forEach((c) => c.classList.toggle('on', c.dataset.q === q));
  };
  render();
  $('#careList').addEventListener('click', (ev) => {
    const h = ev.target.closest('.csec-h'); if (!h) return;
    const sec = h.parentElement, id = sec.dataset.s;
    const open = !sec.classList.contains('open');
    sec.classList.toggle('open', open); h.setAttribute('aria-expanded', open);
    $('.csec-b', sec).hidden = !open;
    if (open) routeState.openSec.add(id); else routeState.openSec.delete(id);
  });
  $('#q').oninput = (ev) => { routeState.q = ev.target.value; render(); };
  $('#clearQ').onclick = () => { routeState.q = ''; $('#q').value = ''; render(); };
  $$('.qchip', root).forEach((c) => c.onclick = () => { routeState.q = routeState.q === c.dataset.q ? '' : c.dataset.q; $('#q').value = routeState.q; render(); });
  $('#relock').onclick = () => {
    CARE = null; localStorage.removeItem('pg.care'); S.careLocked = true; saveSettings();
    toast('케어시트를 다시 잠갔어요'); viewCare(root);
  };
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

/* ───────────────────────── 설정 ───────────────────────── */
const petAge = (p) => [weeksOld(p) != null ? `생후 ${weeksOld(p)}주` : '나이 모름', p.sex].filter(Boolean).join(' · ');
function openSettings() {
  openSheet(`
    <h2>설정</h2>
    <h3>아이</h3>
    ${S.pets.map((p) => `<div class="pet-row ${p.id === pet()?.id ? 'on' : ''}">${img(geumi('idle', 2))}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(petAge(p))}</div></div><button type="button" class="btn sm white" data-edit="${p.id}">수정</button></div>`).join('')}
    <button type="button" class="btn sm white" id="addPet">+ 아이 추가</button>

    <h3>노션 연결</h3>
    <div class="box form">
      <label for="workerUrl" style="margin-top:0">워커 주소</label><input type="url" id="workerUrl" value="${esc(S.workerUrl)}" placeholder="https://geumi-log.coflauu.workers.dev">
      <label for="appKey">앱 키 <small>(케어시트 여는 키와 같아요)</small></label><input type="password" id="appKey" inputmode="numeric" value="${esc(S.appKey)}" placeholder="앱 키">
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn sm" id="saveConn">저장 · 연결 확인</button>
        <button type="button" class="btn sm white" id="pull">노션에서 가져오기</button>
      </div>
      <div class="small muted" id="connMsg" style="margin-top:8px"></div>
    </div>

    <h3>기타</h3>
    <div class="box form">
      <label for="maxVideo" style="margin-top:0">영상 최대 용량 (MB) <small>노션 무료 플랜은 파일당 5MB</small></label>
      <input type="number" id="maxVideo" min="1" max="5000" value="${S.maxVideoMB}">
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn sm white" id="backup">백업 파일 받기</button>
        <label class="btn sm white" for="restore">백업 불러오기</label><input type="file" id="restore" accept="application/json" hidden>
      </div>
      ${CARE ? '<div class="row" style="margin-top:8px"><button type="button" class="btn sm white" id="refetch">케어시트 다시 받기</button></div>' : ''}
    </div>
    <div class="empty small">${img(geumi('happy', 3), '', 'width:63px;height:51px')}금이로그 · 기록은 이 폰에 먼저 저장되고 노션으로 옮겨져요.</div>
    <button type="button" class="btn block white" id="closeSheet">닫기</button>
  `, (sh) => {
    $$('[data-edit]', sh).forEach((b) => b.onclick = () => openPetForm(S.pets.find((p) => p.id === b.dataset.edit)));
    $('#addPet', sh).onclick = () => openPetForm();
    $('#closeSheet', sh).onclick = closeSheet;
    $('#maxVideo', sh).onchange = (ev) => { S.maxVideoMB = Math.max(1, +ev.target.value || 5); saveSettings(); };
    $('#saveConn', sh).onclick = async () => {
      S.workerUrl = $('#workerUrl', sh).value.trim(); S.appKey = $('#appKey', sh).value.trim(); saveSettings();
      const msg = $('#connMsg', sh);
      if (!CARE && S.appKey) unlockCare(S.appKey).then(() => { S.careLocked = false; saveSettings(); }).catch(() => {});
      if (!connected()) { msg.textContent = '저장했어요. 워커 주소와 앱 키를 모두 넣으면 노션에 저장돼요.'; renderSync(); return; }
      msg.textContent = '확인 중…';
      try {
        const r = await api('/ping');
        if (r.missing.length) { await api('/setup', { method: 'POST' }); msg.textContent = `'${r.title}' 연결됨. 속성 ${r.missing.length}개를 만들었어요.`; }
        else msg.textContent = `'${r.title}' 연결됨. 이제 기록이 노션에 쌓여요.`;
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
      a.download = `geumi-log-backup-${today()}.json`; a.click();
    };
    $('#restore', sh).onchange = async (ev) => {
      try {
        const data = JSON.parse(await ev.target.files[0].text());
        if (data.app !== 'pygmy-note') throw new Error();
        for (const e of data.entries) { E.set(e.id, e); await db.put('entries', e); }
        for (const p of data.settings.pets || []) if (!S.pets.find((x) => x.id === p.id)) S.pets.push(p);
        for (const f of data.settings.folders || []) if (!S.folders.includes(f)) S.folders.push(f);
        if (!S.petId) S.petId = S.pets[0]?.id;
        saveSettings(); toast(`${data.entries.length}개 기록을 불러왔어요`); closeSheet(); renderTop(); route();
      } catch { toast('백업 파일을 읽지 못했어요'); }
    };
    $('#refetch', sh)?.addEventListener('click', async () => {
      try { await unlockCare(S.appKey); toast('케어시트를 새로 받았어요'); } catch { toast('앱 키가 맞지 않아요'); }
    });
  });
}

function openPetForm(p) {
  openSheet(`<h2>${p ? '아이 정보 수정' : '아이 추가'}</h2><div id="pf">${petFormHTML(p || { adopt: today() })}</div>
    <div class="row" style="margin-top:16px"><button type="button" class="btn grow" id="pfSave">저장</button>${p && S.pets.length > 1 ? '<button type="button" class="btn white" id="pfDel">삭제</button>' : ''}<button type="button" class="btn white" id="pfCancel">취소</button></div>`, (sh) => {
    $('#pfCancel', sh).onclick = closeSheet;
    $('#pfSave', sh).onclick = () => {
      const np = readPetForm($('#pf', sh), p);
      if (p) S.pets[S.pets.findIndex((x) => x.id === p.id)] = np; else { S.pets.push(np); S.petId = np.id; }
      saveSettings(); closeSheet(); renderTop(); route();
    };
    $('#pfDel', sh)?.addEventListener('click', (ev) => {
      const b = ev.currentTarget;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '정말 지울까요? (기록은 남아요)'; return; }
      S.pets = S.pets.filter((x) => x.id !== p.id); S.petId = S.pets[0]?.id || ''; saveSettings(); closeSheet(); renderTop(); route();
    });
  });
}

function openPetSwitch() {
  openSheet(`<h2>누구 기록할까요?</h2>
    ${S.pets.map((p) => `<button type="button" class="pet-row ${p.id === pet()?.id ? 'on' : ''}" data-pick="${p.id}">${img(geumi('happy', 2))}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(petAge(p))}</div></div></button>`).join('')}
    <button type="button" class="btn sm white" style="margin-top:4px" id="spAdd">+ 아이 추가</button>`, (sh) => {
    $$('[data-pick]', sh).forEach((b) => b.onclick = () => { S.petId = b.dataset.pick; saveSettings(); closeSheet(); renderTop(); route(); });
    $('#spAdd', sh).onclick = () => openPetForm();
  });
}

function renderTop() {
  const p = pet();
  $('#petName').textContent = p?.name || '금이로그';
  renderSync();
}

/* ───────────────────────── 시작 ───────────────────────── */
const TAB_ICONS = { today: () => sticker('milpro', 2), log: () => icon('log', 3), album: () => icon('album', 3), month: () => icon('month', 3), care: () => icon('care', 3) };
async function boot() {
  $$('.tab').forEach((a) => { $('img', a).src = TAB_ICONS[a.dataset.tab](); });
  $('#runnerImg').src = geumi('happy', 2);
  try {
    for (const e of await db.all('entries')) E.set(e.id, e);
    for (const m of await db.all('media')) M.set(m.id, m);
  } catch (err) { console.warn('IndexedDB 사용 불가', err); }
  if (S.appKey && !CARE && !S.careLocked) unlockCare(S.appKey).then(() => route()).catch(() => {});
  $('#openSettings').onclick = openSettings;
  $('#petSwitch').onclick = () => (S.pets.length ? openPetSwitch() : null);
  $('#sheetBackdrop').onclick = closeSheet;
  $('#tabbar').addEventListener('click', (ev) => {
    const a = ev.target.closest('.tab');
    if (a && a.classList.contains('on') && !location.hash.includes('/log/')) { ev.preventDefault(); $('#view').scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { $('.lightbox')?.remove(); closeSheet(); } });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => placeRunner(curTab, false));
  window.addEventListener('online', syncPush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPush(); });
  renderTop();
  route();
  requestAnimationFrame(() => placeRunner(curTab, false));
  syncPush();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
