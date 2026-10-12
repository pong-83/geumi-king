// 픽셀 피그미 캐릭터. 문자 지도를 SVG 사각형으로 그려요.
const PAL = {
  o: '#4b3b31', // 외곽선
  w: '#fffaf1', // 흰 털
  c: '#eadcc8', // 그림자 털
  p: '#f3aeb5', // 귀 · 볼
  k: '#1d1a19', // 눈
  h: '#ffffff', // 눈 하이라이트
  n: '#e98993', // 코
  b: '#9a6a3f', // 씨앗
  d: '#6b4527', // 씨앗 줄무늬
  y: '#f2c94c', // 왕관
  r: '#c2533c', // 왕관 보석
};

const BODY = [
  '..oo........oo..',
  '.opco......ocpo.',
  '.oppcoooooocppo.',
  '..owwwwwwwwwwo..',
  '.owwwwwwwwwwwwo.',
  '.owwkkwwwwkkwwo.',
  'owwwkkwwwwkkwwwo',
  'owpwwwwnnwwwwpwo',
  'owwwwwwwwwwwwwwo',
  '.owwwwccccwwwwo.',
  '.owwwcwwwwcwwwo.',
  '..owwwwwwwwwwo..',
  '..owcwwwwwwcwo..',
  '..owwwwwwwwwwo..',
  '..oocoo..oocoo..',
];

const TAIL = [
  '..oooo..',
  '.owwwwo.',
  'owwwwwwo',
  'owwcwwwo',
  'owwwcwwo',
  'owwwwcwo',
  '.owwwwwo',
  '..owwwwo',
  '..owwwwo',
  '..owwwo.',
  '.owwwwo.',
  'owwwwo..',
  'owwwo...',
  '.ooo....',
];

// 눈 감은 모습 (5~6행 덮어쓰기)
const BLINK = [
  ['.owwwwwwwwwwwwo.', 5],
  ['owwwkkwwwwkkwwwo', 6],
];

// 금이 킹의 왕관
const CROWN = [
  'y.yy.y',
  'yyyyyy',
  'yryyry',
];

const SEED = [
  '.oo.',
  'obdo',
  'obbo',
  '.oo.',
];

function rects(map, ox = 0, oy = 0, only) {
  let s = '';
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || (only && !only.includes(ch))) return;
      s += `<rect x="${x + ox}" y="${y + oy}" width="1.02" height="1.02" fill="${PAL[ch]}"/>`;
    });
  });
  return s;
}

function blinkRects() {
  return BLINK.map(([row, y]) => rects([row], 0, y)).join('');
}

// size: px 너비. mood: idle | eat | sleep
export function pygmySVG({ size = 120, mood = 'idle', cls = '', crown = true } = {}) {
  const w = 21, h = 17;
  const eyes = mood === 'sleep' ? `<g>${blinkRects()}</g>` : `<g class="px-blink">${blinkRects()}</g>`;
  const seed = mood === 'eat' ? `<g class="px-seed">${rects(SEED, 6, 10)}</g>` : '';
  const zz = mood === 'sleep'
    ? `<g class="px-zz" fill="${PAL.o}"><rect x="0" y="0" width="2" height="0.6"/><rect x="1.4" y="0.6" width="0.6" height="0.6"/><rect x="0" y="1.2" width="2" height="0.6"/></g>`
    : '';
  return `<svg class="px-pygmy ${cls} mood-${mood}" viewBox="0 0 ${w} ${h}" width="${size}" height="${size * h / w}" shape-rendering="crispEdges" aria-hidden="true">
    <g class="px-tail">${rects(TAIL, 12, 1)}</g>
    <g class="px-body">${rects(BODY, 0, 2)}</g>
    <g transform="translate(0 2)">${eyes}</g>
    ${crown ? `<g class="px-crown">${rects(CROWN, 5, 1)}</g>` : ''}
    ${seed}${zz}
  </svg>`;
}

// 작은 픽셀 아이콘 (8x8)
const ICONS = {
  seed: ['..oo....', '.obbo...', 'obdbbo..', 'obbdbo..', '.obbbo..', '..ooo...', '........', '........'],
  heart: ['.oo.oo..', 'oppoppo.', 'oppppp o', 'oppppppo', '.oppppo.', '..oppo..', '...oo...', '........'],
  drop: ['...o....', '..owo...', '..owo...', '.owwwo..', 'owwhwwo.', 'owwwwwo.', '.owwwo..', '..ooo...'],
};
export function pixelIcon(name, size = 16) {
  const map = ICONS[name].map((r) => r.replace(/ /g, '.'));
  const pal = name === 'drop' ? { ...PAL, w: '#b9cdf5', h: '#ffffff' } : PAL;
  let s = '';
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') s += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[ch]}"/>`;
  }));
  return `<svg viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}
