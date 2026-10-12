// 피그미 케어 ↔ 노션 프록시 (Cloudflare Worker)
// 노션 토큰은 워커 시크릿(NOTION_TOKEN)에만 두고, 앱은 X-App-Key로 인증해요.
//
// 시크릿/변수
//   NOTION_TOKEN   노션 내부 통합 시크릿 (ntn_...)
//   NOTION_DB_ID   기록 데이터베이스 ID
//   APP_KEY        앱 설정에 입력하는 키
//   ALLOWED_ORIGIN 허용할 사이트 주소 (예: https://pong-83.github.io), 쉼표로 여러 개

const NOTION = 'https://api.notion.com/v1';
const NV = '2022-06-28';

// 앱 필드 → 노션 속성
const PROPS = {
  date: ['날짜', 'date'],
  pet: ['아이', 'select'],
  kind: ['종류', 'select'],
  milpro: ['밀프로', 'number'],
  fruchu: ['후르츄', 'number'],
  worm: ['웜', 'number'],
  wormType: ['웜 종류', 'select'],
  iks: ['익스', 'number'],
  iksNew: ['익스 교체', 'checkbox'],
  fruit: ['과일큐브', 'number'],
  fruitKinds: ['과일', 'multi_select'],
  supp: ['영양제', 'multi_select'],
  water: ['물 교체', 'checkbox'],
  honey: ['꿀·젤리', 'checkbox'],
  feedReset: ['사료 전체교체', 'checkbox'],
  weight: ['몸무게(g)', 'number'],
  temp: ['온도', 'number'],
  humid: ['습도', 'number'],
  clean: ['청소', 'multi_select'],
  handling: ['핸들링', 'number'],
  condition: ['컨디션', 'select'],
  capture: ['보증 캡처', 'checkbox'],
  memo: ['메모', 'rich_text'],
  photos: ['사진 수', 'number'],
  appId: ['앱ID', 'rich_text'],
};

let titleProp = null; // 데이터베이스의 제목 속성 이름 (캐시)

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req.headers.get('Origin') || '', env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.APP_KEY || req.headers.get('X-App-Key') !== env.APP_KEY) {
      return json({ error: '앱 키가 맞지 않아요' }, 401, cors);
    }
    const url = new URL(req.url);
    try {
      const n = notion(env);
      let out;
      if (url.pathname === '/ping') out = await ping(n, env);
      else if (url.pathname === '/setup' && req.method === 'POST') out = await setup(n, env);
      else if (url.pathname === '/entry' && req.method === 'POST') out = await upsert(n, env, await req.json());
      else if (url.pathname === '/entries') out = await list(n, env, url.searchParams.get('from'), url.searchParams.get('to'));
      else if (url.pathname === '/media' && req.method === 'POST') out = await uploadMedia(n, env, req);
      else if (url.pathname === '/album') out = await album(n, env, url.searchParams.get('from'), url.searchParams.get('to'));
      else return json({ error: 'not found' }, 404, cors);
      return json(out, 200, cors);
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500, cors);
    }
  },
};

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-App-Key,X-Entry,X-Filename',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

function notion(env) {
  return async (path, { method = 'GET', body, raw } = {}) => {
    const headers = { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NV };
    if (body && !raw) headers['Content-Type'] = 'application/json';
    const res = await fetch(NOTION + path, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`노션 오류 (${res.status}): ${data.message || res.statusText}`);
      err.status = res.status === 401 || res.status === 404 ? 502 : res.status;
      throw err;
    }
    return data;
  };
}

async function schema(n, env) {
  const dbInfo = await n(`/databases/${env.NOTION_DB_ID}`);
  titleProp = Object.entries(dbInfo.properties).find(([, v]) => v.type === 'title')[0];
  return dbInfo;
}

async function ping(n, env) {
  const d = await schema(n, env);
  const missing = Object.values(PROPS).filter(([name]) => !d.properties[name]).map(([name]) => name);
  return { ok: true, title: d.title?.map((t) => t.plain_text).join('') || '', missing };
}

// 필요한 속성이 없으면 데이터베이스에 추가해요.
async function setup(n, env) {
  const d = await schema(n, env);
  const add = {};
  for (const [name, type] of Object.values(PROPS)) {
    if (!d.properties[name]) add[name] = { [type]: type === 'number' ? { format: 'number' } : {} };
  }
  if (Object.keys(add).length) await n(`/databases/${env.NOTION_DB_ID}`, { method: 'PATCH', body: { properties: add } });
  return { ok: true, added: Object.keys(add) };
}

function toProps(e) {
  const p = {};
  for (const [key, [name, type]] of Object.entries(PROPS)) {
    if (!(key in e)) continue;
    const v = e[key];
    if (type === 'number') p[name] = { number: v === '' || v == null || Number.isNaN(+v) ? null : +v };
    else if (type === 'checkbox') p[name] = { checkbox: !!v };
    else if (type === 'select') p[name] = { select: v ? { name: String(v).slice(0, 100) } : null };
    else if (type === 'multi_select') p[name] = { multi_select: (v || []).map((x) => ({ name: String(x).slice(0, 100) })) };
    else if (type === 'date') p[name] = { date: v ? { start: v } : null };
    else if (type === 'rich_text') p[name] = { rich_text: v ? [{ text: { content: String(v).slice(0, 2000) } }] : [] };
  }
  p[titleProp] = { title: [{ text: { content: e.title || e.id } }] };
  return p;
}

function fromPage(page) {
  const e = { pageId: page.id, editedAt: page.last_edited_time };
  for (const [key, [name, type]] of Object.entries(PROPS)) {
    const prop = page.properties[name];
    if (!prop) continue;
    if (type === 'number') e[key] = prop.number;
    else if (type === 'checkbox') e[key] = prop.checkbox;
    else if (type === 'select') e[key] = prop.select?.name || '';
    else if (type === 'multi_select') e[key] = prop.multi_select.map((o) => o.name);
    else if (type === 'date') e[key] = prop.date?.start?.slice(0, 10) || '';
    else if (type === 'rich_text') e[key] = prop.rich_text.map((t) => t.plain_text).join('');
  }
  e.id = e.appId;
  return e;
}

async function findPage(n, env, appId) {
  const r = await n(`/databases/${env.NOTION_DB_ID}/query`, {
    method: 'POST',
    body: { filter: { property: PROPS.appId[0], rich_text: { equals: appId } }, page_size: 1 },
  });
  return r.results[0] || null;
}

async function upsert(n, env, entry) {
  if (!titleProp) await schema(n, env);
  const e = { ...entry, appId: entry.id };
  delete e.photos; // 사진 수는 업로드할 때만 바꿔요
  const page = await findPage(n, env, e.appId);
  if (page) {
    const r = await n(`/pages/${page.id}`, { method: 'PATCH', body: { properties: toProps(e) } });
    return { pageId: r.id, editedAt: r.last_edited_time };
  }
  const r = await n('/pages', {
    method: 'POST',
    body: { parent: { database_id: env.NOTION_DB_ID }, icon: { type: 'emoji', emoji: e.kind === '회고' ? '📒' : '🐿️' }, properties: toProps(e) },
  });
  return { pageId: r.id, editedAt: r.last_edited_time };
}

async function list(n, env, from, to) {
  if (!titleProp) await schema(n, env);
  const and = [];
  if (from) and.push({ property: PROPS.date[0], date: { on_or_after: from } });
  if (to) and.push({ property: PROPS.date[0], date: { on_or_before: to } });
  const out = [];
  let cursor;
  do {
    const r = await n(`/databases/${env.NOTION_DB_ID}/query`, {
      method: 'POST',
      body: { filter: and.length ? { and } : undefined, page_size: 100, start_cursor: cursor },
    });
    for (const p of r.results) {
      const e = fromPage(p);
      if (e.id) out.push(e);
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return { entries: out };
}

// 사진 · 영상을 노션에 올리고 해당 날짜 페이지 본문에 붙여요.
async function uploadMedia(n, env, req) {
  if (!titleProp) await schema(n, env);
  const entry = JSON.parse(decodeURIComponent(req.headers.get('X-Entry') || '{}'));
  const filename = decodeURIComponent(req.headers.get('X-Filename') || 'photo.jpg');
  const type = req.headers.get('Content-Type') || 'image/jpeg';
  const buf = await req.arrayBuffer();
  if (!entry.id) throw Object.assign(new Error('entry id가 필요해요'), { status: 400 });

  let page = await findPage(n, env, entry.id);
  if (!page) {
    await upsert(n, env, entry);
    page = await findPage(n, env, entry.id);
  }

  const up = await n('/file_uploads', { method: 'POST', body: { filename, content_type: type } });
  const form = new FormData();
  form.append('file', new File([buf], filename, { type }));
  await n(`/file_uploads/${up.id}/send`, { method: 'POST', body: form, raw: true });

  const kind = type.startsWith('video/') ? 'video' : 'image';
  const r = await n(`/blocks/${page.id}/children`, {
    method: 'PATCH',
    body: { children: [{ type: kind, [kind]: { type: 'file_upload', file_upload: { id: up.id } } }] },
  });
  const count = (page.properties[PROPS.photos[0]]?.number || 0) + 1;
  await n(`/pages/${page.id}`, { method: 'PATCH', body: { properties: { [PROPS.photos[0]]: { number: count } } } });
  return { pageId: page.id, blockId: r.results?.[0]?.id };
}

// 기간 안의 사진 · 영상 주소 목록 (노션 파일 주소는 1시간 뒤 만료돼요)
async function album(n, env, from, to) {
  if (!titleProp) await schema(n, env);
  const and = [{ property: PROPS.photos[0], number: { greater_than: 0 } }];
  if (from) and.push({ property: PROPS.date[0], date: { on_or_after: from } });
  if (to) and.push({ property: PROPS.date[0], date: { on_or_before: to } });
  const r = await n(`/databases/${env.NOTION_DB_ID}/query`, { method: 'POST', body: { filter: { and }, page_size: 100 } });
  const items = [];
  for (const p of r.results) {
    const e = fromPage(p);
    const kids = await n(`/blocks/${p.id}/children?page_size=100`);
    for (const b of kids.results) {
      if (b.type !== 'image' && b.type !== 'video') continue;
      const f = b[b.type];
      items.push({ blockId: b.id, entryId: e.id, date: e.date, pet: e.pet, type: b.type, url: f.file?.url || f.external?.url || '' });
    }
  }
  return { items };
}
