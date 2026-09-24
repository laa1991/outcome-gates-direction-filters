// kappa-key-vs-annot.mjs —— 第二个标注人 vs KEY：逐天一致 + Cohen's κ（+ 两发之间的一致率）
//
// 预注册在 design-annotator-study.md：押 κ ≥ 0.6；判伪 κ < 0.4；分歧落在哪几天只作形状记。
// 判据（脚本自己打印）：三组已知答案自检必须先过（手算 0.6875 / 1 / 0），否则 exit 3。
// 缺文件的格一律记「未回」，**不填数**。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const label = (s) => (String(s).match(/(R[1-8]|NONE)/) || [])[1] || '未回';

// —— κ 与自检 ——
const kappa = (mine, theirs) => {
  const n = mine.length;
  const cats = [...new Set([...mine, ...theirs])];
  let same = 0; for (let i = 0; i < n; i++) if (mine[i] === theirs[i]) same++;
  const po = same / n;
  let pe = 0;
  for (const c of cats) {
    const a = mine.filter((x) => x === c).length / n;
    const b = theirs.filter((x) => x === c).length / n;
    pe += a * b;
  }
  return { po, pe, k: pe === 1 ? 1 : (po - pe) / (1 - pe) };
};
const FIX = [
  { mine: ['R1', 'R1', 'R2', 'R2', 'NONE'], th: ['R1', 'R2', 'R2', 'R2', 'NONE'], want: 0.6875 },
  { mine: ['A', 'A', 'B'], th: ['A', 'A', 'B'], want: 1 },
  { mine: ['A', 'A', 'B', 'B'], th: ['A', 'B', 'A', 'B'], want: 0 },
];
let fixBad = 0;
for (const f of FIX) {
  const k = kappa(f.mine, f.th).k;
  const ok = Math.abs(k - f.want) < 1e-9;
  if (!ok) fixBad++;
  console.log(`κ 自检：${JSON.stringify(f.mine)} vs ${JSON.stringify(f.th)} ⇒ ${k.toFixed(4)}（期望 ${f.want}）${ok ? '✅' : '❌'}`);
}

// —— 读 KEY ——
const keyOf = (file) => {
  const t = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const map = {};
  // 两种 KEY 格式：v0 是表格行 `| day-01 | **R4** |`；v7 是列表项 `- **day-01**（亏损日）真值 **R7** · 诱饵 **R4**`
  // （第一版只认表格行 ⇒ 读到 v7 0 天；装置缺陷，不是文件不存在。）
  for (const m of t.matchAll(/^\|\s*(day-\d\d)\s*\|\s*\*\*(R[1-8]|NONE)\*\*/gm)) map[m[1]] = m[2];
  for (const m of t.matchAll(/^-\s*\*\*(day-\d\d)\*\*[^\n]*?真值\s*\*\*(R[1-8]|NONE)\*\*/gm)) map[m[1]] = m[2];
  return map;
};
const KEYS = { v0: keyOf('KEY.md'), v7: keyOf('arms/v7/KEY-v7.md'), v8: keyOf('arms/v8/KEY-v8.md') };
// v8 的 A/B/C 类（预注册的分型押要按它拆）——从 KEY-v8 的 `（A 类 · …）` 里读
const CLS = {};
{
  const t = fs.readFileSync(path.join(ROOT, 'arms/v8/KEY-v8.md'), 'utf8');
  for (const m of t.matchAll(/^-\s*\*\*(day-\d\d)\*\*（([ABC]) 类/gm)) CLS[m[1]] = m[2];
}

// —— 读两批标注 ——
const load = (dir, days) => {
  const abs = path.join(ROOT, dir);
  const out = {};
  for (const d of days) {
    const slots = {};
    for (const s of ['A', 'B']) {
      const f = path.join(abs, `${d}-${s}.md`);
      slots[s] = fs.existsSync(f) ? label(fs.readFileSync(f, 'utf8').match(/FAULT:[^\n]*/)?.[0] || fs.readFileSync(f, 'utf8')) : '未回';
    }
    out[d] = slots;
  }
  return out;
};
const A = load('arms/annot-v0/runs', Object.keys(KEYS.v0));
const B = load('arms/annot-v7/runs', Object.keys(KEYS.v7));
const C = load('arms/annot-v8/runs', Object.keys(KEYS.v8));

const rows = [];
for (const [corpus, ann, key] of [['v0', A, KEYS.v0], ['v7', B, KEYS.v7], ['v8', C, KEYS.v8]]) {
  for (const d of Object.keys(key)) {
    const a = ann[d]?.A || '未回', b = ann[d]?.B || '未回';
    const maj = a === b ? a : (a === '未回' || b === '未回') ? '未回' : '分歧';
    rows.push({ corpus, day: d, a, b, maj, key: key[d], hit: maj === key[d] });
  }
}
console.log(`\nKEY 读到：v0 ${Object.keys(KEYS.v0).length} 天 · v7 ${Object.keys(KEYS.v7).length} 天`);
console.log('语料 天     A     B     多数    KEY     一致');
for (const r of rows) console.log(`${r.corpus.padEnd(4)} ${r.day}  ${r.a.padEnd(5)} ${r.b.padEnd(5)} ${r.maj.padEnd(5)} ${String(r.key).padEnd(6)} ${r.hit ? '✅' : '❌'}`);

const withMaj = rows.filter((r) => r.maj !== '未回' && r.maj !== '分歧');
const tie = rows.filter((r) => r.maj === '分歧').length;
const missing = rows.filter((r) => r.maj === '未回').length;
const k1 = kappa(withMaj.map((r) => r.key), withMaj.map((r) => r.maj));
const both = rows.filter((r) => r.a !== '未回' && r.b !== '未回');
const k2 = kappa(both.map((r) => r.a), both.map((r) => r.b));
console.log(`\n【KEY vs 多数票】天数 ${withMaj.length}（平票剔除 ${tie} · 未回 ${missing}）· 一致 ${withMaj.filter((r) => r.hit).length} · Po=${k1.po.toFixed(3)} Pe=${k1.pe.toFixed(3)} · **κ=${k1.k.toFixed(3)}**`);
console.log(`【标注人之间】可比的 ${both.length} 天 · 一致 ${both.filter((r) => r.a === r.b).length} · Po=${k2.po.toFixed(3)} Pe=${k2.pe.toFixed(3)} · κ=${k2.k.toFixed(3)}`);
// —— 分开报两个分母（2026-09-20 加）：可达天 vs 全部可比天 ——
// 为什么：真值不可达的格（判据依赖的事实不在料里）量的是**我料的缺陷**，不是"映射可复现性"。
let REACH = {};
try { REACH = JSON.parse(fs.readFileSync(path.join(ROOT, 'reachability.json'), 'utf8')); } catch { console.log('（没有 reachability.json ⇒ 只报全部可比天）'); }
const reachOk = (r) => REACH[`${r.corpus}/${r.day}`]?.ok;
const sub = withMaj.filter(reachOk);
if (sub.length) {
  const kr = kappa(sub.map((r) => r.key), sub.map((r) => r.maj));
  console.log(`\n【只算「判据可达」的天】天数 ${sub.length} · 一致 ${sub.filter((r) => r.hit).length} · Po=${kr.po.toFixed(3)} Pe=${kr.pe.toFixed(3)} · **κ=${kr.k.toFixed(3)}**`);
  console.log(`  被剔掉的不可达格：${withMaj.filter((r) => !reachOk(r)).map((r) => `${r.corpus}/${r.day}(${REACH[`${r.corpus}/${r.day}`].missing.join(',')})`).join(' · ') || '（无）'}`);
  console.log(`  ⚠️ 这是**事后分组**（分组依据是跑完之后才做的审计）⇒ 预注册的裁决仍以「全部可比天」那个数为准；可达天这个数只是"为什么"的解释，要成为主张须在下一套语料上预注册。`);
}
// —— v8 的分型判据（预注册：A 类一致率 > B 类，A ≥ 4/5 · B ≤ 2/5）——
const v8rows = withMaj.filter((r) => r.corpus === 'v8');
if (v8rows.length) {
  const byCls = (c) => { const s = v8rows.filter((r) => CLS[r.day] === c); return { n: s.length, ok: s.filter((r) => r.hit).length, s }; };
  const a = byCls('A'), b = byCls('B'), c = byCls('C');
  console.log(`\n【v8 分型（预注册）】A 类「判据直接违背」 ${a.ok}/${a.n} · B 类「判据成立需判断」 ${b.ok}/${b.n} · C 类「无咎」 ${c.ok}/${c.n}`);
  const kv8 = kappa(v8rows.map((r) => r.key), v8rows.map((r) => r.maj));
  console.log(`  v8 单独 κ=${kv8.k.toFixed(3)}（Po=${kv8.po.toFixed(3)} Pe=${kv8.pe.toFixed(3)} · ${v8rows.length} 天可比）`);
  console.log(`  预注册裁决：${kv8.k >= 0.5 ? '✅ 主押成立（κ ≥ 0.5）' : kv8.k < 0.3 ? '❌ 判伪（κ < 0.3）⇒「让判据可达就能提高复现性」也错' : '⚠️ 落在 0.3–0.5 之间'}`);
  console.log(`  分型裁决：${a.ok / Math.max(a.n, 1) > b.ok / Math.max(b.n, 1) && a.ok >= 4 && b.ok <= 2 ? '✅ A > B 且 A ≥ 4/5 · B ≤ 2/5' : `❌ 分型押未成立（A ${a.ok}/${a.n} · B ${b.ok}/${b.n}）`}`);
}

const verdict = k1.k >= 0.6 ? '✅ 预注册成立（κ ≥ 0.6）' : k1.k < 0.4 ? '❌ 判伪（κ < 0.4）⇒ 映射不可被独立复现' : '⚠️ 落在中间（0.4 ≤ κ < 0.6）⇒ 只报点值与形状';
console.log(`预注册裁决：${verdict}`);
console.log(`形状：分歧/未中的天 = ${rows.filter((r) => !r.hit).map((r) => `${r.corpus}/${r.day}`).join(' · ') || '（无）'}`);
console.log(`⚠️ 功效：${rows.length} 格 · 每格 ${both.length ? '2' : '?'} 发 ⇒ κ 的 CI 很宽，本条只报点值与形状，不报显著。`);
process.exit(fixBad === 0 ? 0 : 3);
