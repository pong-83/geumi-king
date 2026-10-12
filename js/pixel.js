// 픽셀 그림: 문자 지도를 캔버스로 그려 data URL로 돌려줘요. 같은 그림은 한 번만 그려요.
export const O = '#2f4166'; // 외곽선 (남색)

const cache = new Map();
export function draw(map, pal, scale = 4, die = false) {
  const key = map.join('|') + JSON.stringify(pal) + scale + die;
  if (cache.has(key)) return cache.get(key);
  const h = map.length, w = Math.max(...map.map((r) => r.length)), pad = die ? 2 : 0;
  const W = w + pad * 2, H = h + pad * 2;
  const mask = Array.from({ length: H }, () => Array(W).fill(false));
  map.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') mask[y + pad][x + pad] = true; });
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d');
  if (die) {
    // 다이컷 스티커: 모양을 따라 흰 테두리
    g.fillStyle = '#ffffff';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const Y = y + dy, X = x + dx;
        if (Y >= 0 && Y < H && X >= 0 && X < W && mask[Y][X]) near = true;
      }
      if (near) g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = pal[ch] || O;
      g.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
    }
  });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/* ── 금이 ───────────────────────── */
const GP = { o: O, w: '#fffaf1', c: '#e6e9f2', p: '#f3aeb5', k: '#1d2233', n: '#e98993', b: '#9a6a3f', d: '#6b4527', y: '#f2c94c', r: '#c2533c', s: '#9fc3ff' };
const BODY = ['..oo........oo..', '.opco......ocpo.', '.oppcoooooocppo.', '..owwwwwwwwwwo..', '.owwwwwwwwwwwwo.', '.owwkkwwwwkkwwo.', 'owwwkkwwwwkkwwwo', 'owpwwwwnnwwwwpwo', 'owwwwwwwwwwwwwwo', '.owwwwccccwwwwo.', '.owwwcwwwwcwwwo.', '..owwwwwwwwwwo..', '..owcwwwwwwcwo..', '..owwwwwwwwwwo..', '..oocoo..oocoo..'];
const TAIL = ['..oooo..', '.owwwwo.', 'owwwwwwo', 'owwcwwwo', 'owwwcwwo', 'owwwwcwo', '.owwwwwo', '..owwwwo', '..owwwwo', '..owwwo.', '.owwwwo.', 'owwwwo..', 'owwwo...', '.ooo....'];
function geumiMap(mood) {
  const g = Array.from({ length: 17 }, () => Array(21).fill('.'));
  const paint = (m, ox, oy) => m.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.' && y + oy < 17 && x + ox < 21) g[y + oy][x + ox] = row[x]; });
  paint(TAIL, 12, 1); paint(BODY, 0, 2);
  if (mood === 'happy') paint(['.owwkkwwwwkkwwo.', 'owwkwwkwwkwwkwwo'], 0, 7);
  if (mood === 'full' || mood === 'sleep') paint(['.owwwwwwwwwwwwo.', 'owwkkkkwwkkkkwwo'], 0, 7);
  if (mood === 'worry') { paint(['.owwkwwwwwwkwwo.', 'owwwkkwwwwkkwwws'], 0, 7); paint(['s', 's'], 15, 8); }
  paint(['y.yy.y', 'yyyyyy', 'yryyry'], 5, 1);
  if (mood === 'eat') paint(['.oo.', 'obdo', 'obbo', '.oo.'], 6, 11);
  return g.map((r) => r.join(''));
}
export const geumi = (mood = 'idle', scale = 6) => draw(geumiMap(mood), GP, scale);

/* ── 스티커 (12×12) ─────────────── */
export const STICKERS = {
  milpro: { label: '밀프로', pal: { o: O, b: '#c99a5b', h: '#ebc58c', d: '#8a5e2e' },
    map: ['............', '....ooo.....', '...ohbbo....', '..ohbbbdo...', '..obbbbdoooo', '...oddoohbbo', '..oooohbbbdo', '.ohbbobbbbdo', 'ohbbbdoddddo', 'obbbbdo.ooo.', '.oddddo.....', '..oooo......'] },
  fruchu: { label: '후르츄', pal: { o: O, L: '#f8c3c8', P: '#e8707c', H: '#ffffff', D: '#b84a57' },
    map: ['............', '...ooooooo..', '..oLLLLLLoo.', '.oLLLLLLoDo.', '.ooooooooDDo', '.oPHPPPPoDDo', '.oHPPPPPoDDo', '.oPPPPPPoDDo', '.oPPPPPPoDDo', '.oPPPPPPoDo.', '.oPPPPPPoo..', '.oooooooo...'] },
  worm: { label: '웜', pal: { o: O, y: '#f6dfa6', s: '#d9b56a', k: '#8a5e2e' },
    map: ['............', '............', '....ooooo...', '...oyyysyo..', '..oysyoooo..', '..oyyo......', '..osyo......', '..oyyo...oo.', '..oysyooooko', '...oyyysyyyo', '....ooooooo.', '............'] },
  iks: { label: '익스', pal: { o: O, g: '#9cbf74', L: '#d6e6bf', d: '#6e8f4a' },
    map: ['............', '.......ooo..', '......oLggo.', '.....oLgggo.', '....oLgdgdo.', '...oLgggdo..', '..oLgdgdo...', '.oLgggdo....', '.oggdgdo....', '.ogggdo.....', '..oooo......', '............'] },
  fruit: { label: '과일', pal: { o: O, r: '#e85d5d', h: '#ffd2d2', d: '#b13e3e', g: '#8fb35f', s: '#7a5230' },
    map: ['......oo....', '.....os.oo..', '.....osogo..', '..oooooooo..', '.ohhrrrrrro.', 'ohhrrrrrrrdo', 'ohrrrrrrrrdo', 'orrrrrrrrrdo', 'orrrrrrrrddo', '.orrrrrrddo.', '..odddddoo..', '...oooooo...'] },
  water: { label: '물 교체', pal: { o: O, b: '#8fb0ee', h: '#ffffff', d: '#5f86d6' },
    map: ['......o.....', '.....obo....', '.....obo....', '....obbbo...', '...obhbbbo..', '..obhbbbbbo.', '..obhbbbbbo.', '.obbbbbbbbbo', '.obbbbbbbdbo', '..obbbbbddo.', '...obbddo...', '....oooo....'] },
  clean: { label: '청소', pal: { o: O, w: '#8fb0ee', y: '#f2c94c', s: '#c99a2e' },
    map: ['.........oo.', '........owo.', '.......owo..', '......owo...', '.....owo....', '...ooooo....', '..oyyyyyo...', '.oyyyyyyyo..', 'oyyyyyyyyo..', 'oysysysyo...', 'osysysyo....', 'oooooooo....'] },
};
export const sticker = (k, scale = 5) => draw(STICKERS[k].map, STICKERS[k].pal, scale, true);

/* ── 작은 아이콘 (8×8) ──────────── */
const ICONS = {
  heart: [['.oo.oo.', 'oppoppo', 'opppppo', 'opppppo', '.opppo.', '..opo..', '...o...'], { p: '#f3aeb5' }],
  heartOff: [['.oo.oo.', 'oppoppo', 'opppppo', 'opppppo', '.opppo.', '..opo..', '...o...'], { p: '#ffffff' }],
  check: [['.........oo', '........oko', '.......oko.', 'oo....oko..', 'oko..oko...', '.okooko....', '..okko.....', '...oo......'], { o: '#2f4e9a', k: '#5f86d6' }],
  lock: [['...oooooo...', '..oo....oo..', '..o......o..', '..o......o..', 'oooooooooooo', 'oyyyyyyyyyyo', 'oyyyyooyyyyo', 'oyyyyooyyyyo', 'oyyyyyoyyyyo', 'oyyyyyoyyyyo', 'oyyyyyyyyyyo', 'oooooooooooo'], { y: '#f2c94c' }],
  lockOpen: [['...oooooo...', '..oo....oo..', '..o......o..', '..o.........', '..o.........', 'oooooooooooo', 'oyyyyyyyyyyo', 'oyyyyooyyyyo', 'oyyyyooyyyyo', 'oyyyyyoyyyyo', 'oyyyyyyyyyyo', 'oooooooooooo'], { y: '#f2c94c' }],
  plus: [['..oo..', '..oo..', 'oooooo', 'oooooo', '..oo..', '..oo..'], { o: '#6fa8dc' }],
  log: [['oooooooo', 'owwwwwwo', 'owkkkkwo', 'owwwwwwo', 'owkkkwwo', 'owwwwwwo', 'owkkkkwo', 'oooooooo'], { w: '#fff', k: '#6fa8dc' }],
  album: [['oooooooo', 'obbbbbbo', 'obbybbbo', 'obbbbbbo', 'obgbbgbo', 'oggggggo', 'owwwwwwo', 'oooooooo'], { b: '#b9cdf5', y: '#f2c94c', g: '#9cbf74', w: '#fff' }],
  month: [['.o..o...', 'oooooooo', 'orrrrrro', 'owwwwwwo', 'owkwkwko', 'owwwwwwo', 'owkwkwwo', 'oooooooo'], { r: '#e8707c', w: '#fff', k: O }],
  care: [['.oooooo.', 'oyyyyyyo', 'oyoyyyyo', 'oyyyyyyo', 'oyoyyyyo', 'oyyyyyyo', 'oyoyyyyo', '.oooooo.'], { y: '#f5e98e' }],
  bowl: [['........', '.oo.oo..', 'obbobbo.', 'obbobbo.', 'oooooooo', 'oppppppo', '.oppppo.', '..oooo..'], { b: '#c99a5b', p: '#f3aeb5' }],
  pill: [['...ooo..', '..orrro.', '.orrrro.', 'owwwrro.', 'owwwwo..', 'owwwo...', '.ooo....', '........'], { r: '#e8707c', w: '#fff' }],
  camera: [['..ooo...', 'oooooooo', 'owwoowwo', 'owobbowo', 'owobbowo', 'owwoowwo', 'oooooooo', '........'], { w: '#fff', b: '#8fb0ee' }],
  shield: [['oooooooo', 'oyyyyyyo', 'oyyyyyyo', 'oyywyyyo', 'oyyyyyyo', '.oyyyyo.', '..oyyo..', '...oo...'], { y: '#f2c94c', w: '#fff' }],
  hand: [['.o.o.o..', 'owowowo.', 'owowowo.', 'owwwwwoo', 'owwwwwwo', 'owwwwwo.', '.owwwwo.', '..oooo..'], { w: '#fffaf1' }],
  drop: [['...o....', '..obo...', '..obo...', '.obbbo..', 'obhbbbo.', 'obbbbbo.', '.obbbo..', '..ooo...'], { b: '#8fb0ee', h: '#fff' }],
  apple: [['...o....', '..oso...', '.ooooo..', 'ohrrrro.', 'orrrrro.', 'orrrrro.', '.orrro..', '..ooo...'], { r: '#e85d5d', h: '#ffd2d2', s: '#8fb35f' }],
  worm: [['........', '..oooo..', '.oyyyyo.', 'oyoooyo.', 'oyo..oo.', 'oyyooyyo', '.oyyyyko', '..ooooo.'], { y: '#f6dfa6', k: '#8a5e2e' }],
  folder: [['.ooo....', 'oyyyoooo', 'oyyyyyyo', 'oyyyyyyo', 'oyyyyyyo', 'oyyyyyyo', 'oooooooo'], { y: '#f5e98e' }],
  flag: [['o.......', 'ooooo...', 'orrrro..', 'orrrrro.', 'oooooo..', 'o.......', 'o.......', 'o.......'], { r: '#e8707c' }],
  calendar: [['.o..o...', 'oooooooo', 'orrrrrro', 'owwwwwwo', 'owkwkwko', 'owwwwwwo', 'owkwkwwo', 'oooooooo'], { r: '#e8707c', w: '#fff', k: O }],
  thermo: [['...oo...', '..owwo..', '..owwo..', '..orro..', '..orro..', '.orrrro.', '.orrrro.', '..oooo..'], { w: '#fff', r: '#e8707c' }],
  ban: [['..oooo..', '.orrrro.', 'orrwwrro', 'orwwrwro', 'orwrwwro', 'orrwwrro', '.orrrro.', '..oooo..'], { r: '#e8707c', w: '#fff' }],
  home: [['...oo...', '..oyyo..', '.oyyyyo.', 'oyyyyyyo', '.owwwwo.', '.owkkwo.', '.owkkwo.', '.oooooo.'], { y: '#f2c94c', w: '#fff', k: O }],
  food: [['........', '.oo.oo..', 'obbobbo.', 'obbobbo.', 'oooooooo', 'oppppppo', '.oppppo.', '..oooo..'], { b: '#c99a5b', p: '#f3aeb5' }],
  q: [['.oooooo.', 'obbbbbbo', 'obwwwbbo', 'obbbwbbo', 'obbwbbbo', 'obbbbbbo', 'obbwbbbo', '.oooooo.'], { b: '#8fb0ee', w: '#fff' }],
};
export const icon = (name, scale = 3) => { const [m, p] = ICONS[name] || ICONS.q; return draw(m, { o: O, ...p }, scale); };
export const img = (src, cls = '', style = '', alt = '') => `<img class="pix ${cls}" src="${src}" alt="${alt}"${style ? ` style="${style}"` : ''}>`;
