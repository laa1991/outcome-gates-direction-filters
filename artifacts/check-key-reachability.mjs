// check-key-reachability.mjs —— **真值可达性审计**：KEY 的判错点所依赖的数/词，在日文件里到底有没有？
//
// 为什么有它（2026-09-20 血的教训）：第二个标注人跑完、κ=0.357 之后我才发现，**分歧格里有一半是
// 我的料缺了判据**（KEY 的判错点用了料里没有的数）⇒ 读者无论如何都判不出来。那次审计本该在**开火前**跑。
//
// 用法：`node check-key-reachability.mjs`   缺判据 ⇒ 逐格列出 ❌ 并 **exit 3**（拒绝落盘）。
// 输出 `reachability.json`，供 kappa-key-vs-annot.mjs 拆分母用。
//
// 两条口径（分开报，别混）：
//   ① **数值**：KEY 判错点里的每个数字，在日文件里必须出现（自动抽）。
//   ② **词**：数值抓不到「负面 / 冲高回落」这类词级判据 ⇒ 手工维护一小张表（下面 WORDS），并**逐条打印**，
//      这样它是不是漏了/多了，人一眼能看出（自动抽词会被散文里的比喻词污染）。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const CORPUS = [
  { name: 'v0', key: 'KEY.md', days: ['day-01', 'day-02', 'day-03', 'day-04', 'day-05'], dayDir: 'days' },
  { name: 'v7', key: 'arms/v7/KEY-v7.md', days: ['day-01', 'day-02', 'day-03', 'day-04', 'day-05', 'day-06', 'day-07', 'day-08'], dayDir: 'arms/v7/days' },
  { name: 'v8', key: 'arms/v8/KEY-v8.md', days: ['day-01', 'day-02', 'day-03', 'day-04', 'day-05', 'day-06', 'day-07', 'day-08', 'day-09', 'day-10'], dayDir: 'arms/v8/days' },
];
// 词级判据：手写，只列「判错点成立所必需」的词。
// ⚠️ v0/day-04 那格是它的起因：KEY 说新闻「负面」，而料里写的是正面 ⇒ 真值不可达（`challenges.md` C-02 早记过）。
const WORDS = {
  'v0/day-01': ['0.5'],
  'v0/day-02': ['回落'],
  'v0/day-04': ['负面'],
  'v7/day-01': ['冲高回落'],
  'v7/day-06': ['板块指数'],
  'v7/day-07': ['独家'],
  'v8/day-03': ['独家'],
  'v8/day-07': ['冲高回落'],
  'v8/day-09': ['尾盘跳水', '板块指数'],
};

const truthOf = (t, name) => {
  const m = {};
  if (name === 'v0') for (const r of t.matchAll(/^\|\s*(day-\d\d)\s*\|\s*\*\*(R[1-8]|NONE)\*\*\s*\|([^|]*)\|/gm)) m[r[1]] = { truth: r[2], why: r[3] };
  else for (const r of t.matchAll(/^-\s*\*\*(day-\d\d)\*\*[^\n]*?真值\s*\*\*(R[1-8]|NONE)\*\*([^\n]*)\n\s*-\s*判错点：([^\n]*)/gm)) m[r[1]] = { truth: r[2], why: r[4] };
  return m;
};

const out = {}; let bad = 0, checked = 0;
// `--only=v8` ⇒ 只审这一套（v0/v7 已知有 5 格坏，不该拖住 v8 的开火闸门）
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const LIST = ONLY ? CORPUS.filter((c) => c.name === ONLY) : CORPUS;
if (ONLY && LIST.length === 0) { console.log(`!! --only=${ONLY} 不在清单里`); process.exit(3); }
console.log(`审的语料：${LIST.map((c) => c.name).join(' · ')}${ONLY ? '（--only）' : '（全部）'}\n`);
for (const c of LIST) {
  const keymap = truthOf(fs.readFileSync(path.join(ROOT, c.key), 'utf8'), c.name);
  const found = Object.keys(keymap).length;
  if (found !== c.days.length) { console.log(`!! KEY 解析不全：${c.key} 只解析出 ${found}/${c.days.length} 天`); bad++; }
  for (const d of c.days) {
    const day = fs.readFileSync(path.join(ROOT, c.dayDir, `${d}.md`), 'utf8');
    const why = keymap[d]?.why || '';
    const nums = [...new Set([...((why.match(/\d+(?:\.\d+)?/g) || [])).filter((n) => !/^(1|2|3|4|5|6|7|8)$/.test(n) || why.includes(`×${n}`)), ...(why.match(/\d+(?:\.\d+)?(?=\s*(?:日|天|%|B|M|倍))/g) || [])])];
    // ⚠️ 个位数默认丢掉（怕撞规则号 R1..R8），但**带单位的个位数正是判据本身**（「财报在 4 日后」vs「3 日内」）
    // —— 第一版把 v8/day-01 审成「查了 0 个数」，等于没审 ⇒ 这里把带 日/天/%/B/M/倍 的数一律收进来。
    // ⚠️ **带边界**的匹配：第一版用 `day.includes(n)` ⇒ '6.1' 撞进了料里的 '26.1'，假阳性把它报成"可达"。
    // （我的老形状：两个东西同形、我按一个处理。）数字必须在两侧不是数字/小数点。
    const has = (hay, n) => new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}($|[^\\d])`).test(hay);
    const missNum = nums.filter((n) => !has(day, n));
    const missWord = (WORDS[`${c.name}/${d}`] || []).filter((w) => !day.includes(w));
    const ok = missNum.length === 0 && missWord.length === 0;
    if (!ok) bad++;
    checked++;
    out[`${c.name}/${d}`] = { truth: keymap[d]?.truth, ok, missing: [...missNum, ...missWord], why: why.slice(0, 90) };
    console.log(`${(c.name + '/' + d).padEnd(11)} 真值 ${String(keymap[d]?.truth).padEnd(5)} ${ok ? '✅ 判据可达' : '❌ 不可达 —— 料里缺：' + [...missNum, ...missWord].join(' · ')}   （查了 ${nums.length} 个数 + ${(WORDS[`${c.name}/${d}`] || []).length} 个词）`);
    console.log(`            审的是：${why.slice(0, 78) || '（没抽到判错点那句 —— 检查 KEY 格式）'}`);
    if (!why) bad++;
  }
}
const okN = Object.values(out).filter((v) => v.ok).length;
console.log(`\n可达 ${okN}/${checked} 格 · 不可达 ${checked - okN} ⇒ ${bad ? 'exit 3（按纪律：不可达的格不参与「读法多义」那一半的 κ）' : '全可达'}`);
fs.writeFileSync(path.join(ROOT, 'reachability.json'), JSON.stringify(out, null, 1), 'utf8');
console.log(`写 reachability.json（${Object.keys(out).length} 格）`);
process.exit(bad ? 3 : 0);
