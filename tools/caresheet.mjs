// 케어시트 암호화 도구
// 케어시트는 외부 공유 금지 자료라서 저장소에는 암호문만 올라가요.
// 앱은 설정에 입력한 '앱 키'로 브라우저에서 복호화해요.
//
//   node tools/caresheet.mjs encrypt <caresheet.json> <앱 키>  > data/caresheet.enc.json
//   node tools/caresheet.mjs decrypt data/caresheet.enc.json <앱 키>
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const ITER = 150000;
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const [cmd, file, pass] = process.argv.slice(2);
if (!cmd || !file || !pass) {
  console.error('usage: node tools/caresheet.mjs encrypt|decrypt <file> <앱 키>');
  process.exit(1);
}

if (cmd === 'encrypt') {
  const plain = readFileSync(file, 'utf8');
  JSON.parse(plain); // 형식 확인
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  process.stdout.write(JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) }) + '\n');
} else if (cmd === 'decrypt') {
  const enc = JSON.parse(readFileSync(file, 'utf8'));
  const key = await deriveKey(pass, unb64(enc.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.data));
  process.stdout.write(new TextDecoder().decode(plain));
}
