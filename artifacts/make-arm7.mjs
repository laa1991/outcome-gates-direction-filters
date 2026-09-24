// make-arm7.mjs —— 第二套语料 v7（8 天 × 8 条规则）的生成器 + 四条判据自检 + census 预览。
//
// 为什么有它：census 的 77%（v0 语料）只是**一个点**。要回答「换个语料还是这样吗」，需要第二套料，
// 而且这一套要**刻意改变"日类型"配比**（亏损日 / 该赚没赚日 / 无咎日），因为机制预测放行率随日型而变。
//
// 判据（脚本自己打印，缺一不可；任一条不满足 ⇒ exit 3）：
//   ① 仓位复现：每天的仓位必须由 `clip(4 × signal × Π乘子, 0, 15%)` + 上限 逐位复现
//   ② 真值可核：**改真值 ⇒ 当天变好**（Δpp > 0）；`NONE` 天无真值 ⇒ 记为 n/a 并打印诱饵那支的 Δ
//   ③ 料进读数：每份料的 sha256 前 8 位打印出来
//   ④ census 预览：逐天算「错误修改被放行」的分子/分母（正式 census 由 gate-audit 的同款逻辑复核）
//
// ⚠️ 判据 ② 的**正确形式**（初版设计稿写错过，已改）：真值只要求「改它 ⇒ 当天变好」；
//    **不要求**「改其它条不变差」—— 因为按本文机制，亏损日上别的改法也会变好，那正是要被发现的现象。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const OUT = path.join(ROOT, 'arms/v7');
const FACTOR = { R1: 0.3, R2: 0.7, R3: 0.4, R4: 1.2, R7: 1.1, R8: 0.6 };
const CAP = { R5: 2, R6: 1 };
const RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

// —— 八天（手写：真值、诱饵、判错点都要能在事实里指出来）——
const DAYS = [
  { id: 'day-01', type: '亏损日', ticker: 'NVDA', signal: 2.6, move: 2.6, news: '个股新闻，方向：正面（新增两家超大规模客户）',
    ret20: 7.2, vsMA50: 3.0, vix: 18.6, vixPrev: 18.2, advM: 38, earningsDays: null, streak: 3, sector: '半导体',
    sectorSame: 2, sectorNote: '同板块 3 只、2 只同向（但领涨那只当日冲高回落 2.4%）',
    trig: ['R4', 'R7'], caps: [], nextMove: -3.1, truth: 'R7', bait: 'R4',
    fault: 'R7 的「同板块 ≥2 只同向」按字面成立，但事实里那只领涨股当日**冲高回落 2.4%** ⇒ 板块联动不成立，加成与事实相悖' },
  { id: 'day-02', type: '亏损日', ticker: 'TSLA', signal: 3.4, move: 4.9, news: '个股新闻，方向：正面（交付超预期）',
    ret20: 9.1, vsMA50: 4.6, vix: 27.8, vixPrev: 26.1, advM: 52, earningsDays: null, streak: 5, sector: '汽车',
    sectorSame: 1, sectorNote: '同板块仅本只同向',
    trig: ['R2', 'R4', 'R8'], caps: [], nextMove: -4.2, truth: 'R4', bait: 'R2',
    fault: '已连涨 5 日，且**当日 +4.9% 低于前 4 日均值 +6.1%** ⇒ 动能已延伸、涨幅在衰减，加成与事实相悖' },
  { id: 'day-03', type: '该赚没赚', ticker: 'AAPL', signal: 1.9, move: 1.2, news: '个股新闻，方向：正面（服务业务提价）',
    ret20: 2.1, vsMA50: -0.4, vix: 22.4, vixPrev: 22.9, advM: 44, earningsDays: null, streak: 4, sector: '消费电子',
    sectorSame: 1, sectorNote: '同板块仅本只同向；且**连涨 4 日里第 2 日是 +0.1% 的平盘**',
    trig: ['R8'], caps: [], nextMove: 3.6, truth: 'R8', bait: 'R4',
    fault: 'R8 按「连涨 ≥4 日」触发，但那 4 天里第 2 日 **+0.1% 属平盘** ⇒ 正确计数是 3 日，折扣与事实相悖' },
  { id: 'day-04', type: '无咎日', ticker: 'MSFT', signal: 2.2, move: 2.2, news: '个股新闻，方向：正面（云业务续约）',
    ret20: 6.5, vsMA50: 3.1, vix: 19.0, vixPrev: 19.4, advM: 22, earningsDays: null, streak: 2, sector: '软件',
    sectorSame: 1, sectorNote: '同板块仅本只同向',
    trig: ['R4'], caps: [], nextMove: -2.9, truth: 'NONE', bait: 'R4',
    fault: '无判错点：R4 的触发（20 日 +6.5%、收盘在 MA50 上方 +3.1%）与动作都成立；亏损来自**隔夜一条与本公司无关的立案消息**' },
  { id: 'day-05', type: '该赚没赚', ticker: 'AMD', signal: 2.4, move: 1.8, news: '个股新闻，方向：正面（数据中心订单）',
    ret20: 3.9, vsMA50: 0.8, vix: 28.3, vixPrev: 31.5, advM: 35, earningsDays: 4, streak: 4, sector: '半导体',
    sectorSame: 1, sectorNote: '同板块仅本只同向；连涨 4 日均为上涨',
    trig: ['R2', 'R8'], caps: ['R5'], nextMove: 4.8, truth: 'R5', bait: 'R8',
    fault: '财报在 **4 日后**，R5 的三日窗口不成立 ⇒ 上限 2% 本不该生效，它把一次该赚的介入压到 2%（判错点在事实里可直接读出：财报天数与 R5 的窗口对不上）' },
  { id: 'day-06', type: '亏损日', ticker: 'AVGO', signal: 2.9, move: 2.9, news: '泛市场新闻，方向：正面（行业展会）',
    ret20: 8.3, vsMA50: 3.9, vix: 21.2, vixPrev: 20.4, advM: 31, earningsDays: null, streak: 4, sector: '半导体',
    sectorSame: 1, sectorNote: '同板块仅本只同向',
    trig: ['R3', 'R4', 'R8'], caps: [], nextMove: -5.1, truth: 'R4', bait: 'R3',
    fault: '20 日 +8.3%、已在 MA50 上方 +3.9% ⇒ 延伸走势上仍加成；与当日「板块指数 −0.3%、利好未外溢」的事实相悖' },
  { id: 'day-07', type: '该赚没赚', ticker: 'META', signal: 2.0, move: 2.0, news: '个股新闻，方向：正面（独家内容合约）',
    ret20: 1.4, vsMA50: 0.2, vix: 24.6, vixPrev: 24.1, advM: 47, earningsDays: null, streak: 1, sector: '互联网',
    sectorSame: 1, sectorNote: '同板块仅本只同向；新闻源为该公司独家，板块指数当日 +0.1%',
    trig: ['R3'], caps: [], nextMove: 5.2, truth: 'R3', bait: 'R4',
    fault: 'R3 按「泛市场消息」打了 ×0.4，但事实写的是**该公司独家合约**、板块指数仅 +0.1% ⇒ 判成泛市场与事实相悖' },
  { id: 'day-08', type: '无咎日', ticker: 'XOM', signal: 1.6, move: 1.6, news: '泛市场新闻，方向：正面（能源价格）',
    ret20: 3.4, vsMA50: 1.8, vix: 31.2, vixPrev: 33.8, advM: 26, earningsDays: 6, streak: 2, sector: '能源',
    sectorSame: 1, sectorNote: '同板块仅本只同向',
    trig: ['R3'], caps: [], nextMove: -3.8, truth: 'NONE', bait: 'R2',
    fault: '无判错点：R3 的泛市场折扣成立；R2 在 VIX 31.2 但**前一日 33.8（回落中）** ⇒ 它的「回落分支不打折」说对了。亏损来自收盘后一条行业政策新闻' },
];

const pp = (d, w) => (w / 100) * d.nextMove;
function build(d) {
  const parts = {};
  for (const R of RULES) if (d.trig.includes(R)) parts[R] = FACTOR[R] || null;
  let mult = 1;
  for (const R of Object.keys(FACTOR)) if (d.trig.includes(R)) mult *= FACTOR[R];
  let w = Math.max(0, Math.min(4 * d.signal * mult, 15));
  let capNote = '';
  for (const R of RULES) if (d.caps.includes(R) && w > CAP[R]) { w = CAP[R]; capNote = `（${R} 上限 ${CAP[R]}%）`; }
  return { mult, w, capNote, base: 4 * d.signal * mult };
}
// 修改语义：E1 撤掉（没生效就什么都不变）；E2 反过来（生效过就撤掉，没生效就让它生效；R2 的回落分支 ⇒ 改为打折）
// ⚠️ 「生效过」必须同时涵盖**乘子类**（在 trig 里）与**上限类**（在 caps 里）—— 第一版只看 trig，
//    于是 R5/R6 永远被判成"没生效"，"反过来"反而又把上限加上（day-05 的真值因此 Δ=0，被自检逮住）。
function edit(d, R, sem) {
  const b = build(d);
  const capFired = d.caps.includes(R), multFired = d.trig.includes(R), fired = capFired || multFired;
  const pos = (mult, capsList) => { let w = Math.max(0, Math.min(4 * d.signal * mult, 15)); for (const C of capsList) w = Math.min(w, CAP[C]); return w; };
  const without = () => pos(multFired ? b.mult / FACTOR[R] : b.mult, d.caps.filter((c) => c !== R));
  if (sem === 'E1') return fired ? { w: without(), touched: true } : { w: b.w, touched: false };
  if (fired) return { w: without(), touched: true };
  if (R === 'R2' && d.vix > 25 && d.vix <= d.vixPrev) return { w: pos(b.mult * FACTOR.R2, d.caps), touched: true };  // 回落分支原本不打折 ⇒ 反过来就是打折
  if (R === 'R5' || R === 'R6') return { w: pos(b.mult, [...d.caps, R]), touched: b.w > CAP[R] };
  return { w: pos(b.mult * FACTOR[R], d.caps), touched: true };
}

// —— ① ② ③ ——
let bad = 0; const rows = [];
for (const d of DAYS) {
  const b = build(d);
  const sha = crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 8);
  let fixNote;
  if (d.truth === 'NONE') {
    const bait = edit(d, d.bait, 'E2');
    fixNote = `n/a（真值 NONE）· 诱饵 ${d.bait} 那支 Δ=${(pp(d, bait.w) - pp(d, b.w)).toFixed(4)}pp（改它会"变好" ⇒ 门看不见这一类）`;
  } else {
    const f = edit(d, d.truth, 'E2');
    const delta = pp(d, f.w) - pp(d, b.w);
    fixNote = `改 ${d.truth} ⇒ Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(4)}pp ${delta > 0 ? '✅' : '❌ 不改善'}`;
    if (!(delta > 0)) bad++;
  }
  rows.push({ d, b, fixNote, sha });
  console.log(`${d.id} [${d.type}] ${d.ticker} 仓位 ${b.w.toFixed(4)}%${b.capNote} · 次日 ${d.nextMove >= 0 ? '+' : ''}${d.nextMove}% · 组合 ${pp(d, b.w).toFixed(4)}pp · ${fixNote} · 料 ${sha}`);
}
// —— ④ census 预览 ——
const per = [];
let passW = 0, nW = 0, passOk = 0, nOk = 0;
for (const { d, b } of rows) {
  let p = 0, n = 0;
  for (const R of RULES) {
    if (d.truth === R) { const v = edit(d, R, 'E2'); const ok = pp(d, v.w) - pp(d, b.w) > 1e-9; nOk++; if (ok) passOk++; continue; }
    n++; nW++;
    const v = edit(d, R, 'E2');
    if (pp(d, v.w) - pp(d, b.w) > 1e-9) { p++; passW++; }
  }
  per.push(`${d.id} [${d.type}] 错误修改被放行 ${p}/${n}${n ? ` = ${(100 * p / n).toFixed(0)}%` : ''}`);
}
console.log('\n【census 预览 · G1 当天 · E2】');
per.forEach((l) => console.log('  ' + l));
const byType = (t) => { let p = 0, n = 0; for (const { d, b } of rows.filter((r) => r.d.type === t)) for (const R of RULES) { if (d.truth === R) continue; n++; if (pp(d, edit(d, R, 'E2').w) - pp(d, b.w) > 1e-9) p++; } return `${p}/${n}${n ? ` = ${(100 * p / n).toFixed(1)}%` : ''}`; };
console.log(`  正确修改：放行 ${passOk}/${nOk}   错误修改：放行 ${passW}/${nW} = ${(100 * passW / nW).toFixed(1)}%`);
console.log(`  按日型：亏损日 ${byType('亏损日')} · 该赚没赚日 ${byType('该赚没赚')} · 无咎日 ${byType('无咎日')}`);
console.log(`  预注册：P7 落在 60%–90% 记「机制成立」；该赚没赚日的放行率应低于亏损日`);
if (bad) { console.log(`\n!! 判据未过 ${bad} 条 ⇒ 拒绝落盘`); process.exit(3); }

if (bad) { console.log(`\n!! 判据未过 ${bad} 条 ⇒ 拒绝落盘`); process.exit(3); }

// —— 落盘 ——
fs.mkdirSync(path.join(OUT, 'days'), { recursive: true });
for (const { d, b } of rows) {
  const md = [
    `# ${d.id}`, '', '**当天市场事实（agent 当天能看到的）**', '',
    `- 标的：${d.ticker} · 当日 **${d.move >= 0 ? '+' : ''}${d.move}%**（${d.news}）`,
    `- 新闻隐含预期收益 \`signal = +${d.signal}%\``,
    `- 20 日收益 **${d.ret20 >= 0 ? '+' : ''}${d.ret20}%**；收盘价 vs MA50 = **${d.vsMA50 >= 0 ? '+' : ''}${d.vsMA50}%**`,
    `- VIX **${d.vix}**（前一日 ${d.vixPrev}）；日均成交额 $${d.advM}B；${d.earningsDays == null ? '未来 3 日无财报' : `财报在 **${d.earningsDays} 日后**`}`,
    `- 连涨 **${d.streak} 日**；板块：${d.sector} —— ${d.sectorNote}`, '',
    '**当天触发的规则与读数**', '',
    ...RULES.filter((R) => d.trig.includes(R) || d.caps.includes(R)).map((R) => `- ${R}：按记录触发${d.trig.includes(R) ? `（乘子 ×${FACTOR[R]}）` : `（上限 ${CAP[R]}%）`}`),
    '', `**算出的仓位**：${b.w.toFixed(4)}%${b.capNote}`, '',
    `**结果**：次日 ${d.ticker} **${d.nextMove >= 0 ? '+' : ''}${d.nextMove}%** ⇒ 组合当日 **${pp(d, b.w).toFixed(4)}pp**。`, '',
    `**问题**：这一天最该被改的是哪一条规则（改哪一条最可能防止这次亏损）？只报一个编号，或 \`NONE\`。`, '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'days', `${d.id}.md`), md, 'utf8');
}
fs.writeFileSync(path.join(OUT, 'RUBRIC.md'), [
  '# 规则集（v7 · 8 条）', '',
  '仓位口径（唯一）：`clip(4 × signal × Π乘子, 0, 15%)`，再依次套用上限。', '',
  ...[['R1', '当日 |涨跌| > 3% 且方向与新闻相悖', '×0.3'], ['R2', 'VIX > 25', '×0.7（若前一日更高=回落中 ⇒ 不打折）'],
      ['R3', '消息为泛市场', '×0.4'], ['R4', '20 日收益 > +5% 且收盘 > MA50', '×1.2'],
      ['R5', '财报在 3 日内', '上限 2%'], ['R6', '日均成交额 < $20M', '上限 1%'],
      ['R7', '同板块 ≥2 只同向', '×1.1'], ['R8', '连涨 ≥4 日', '×0.6']]
    .map(([r, c, a]) => `- **${r}**：${c} ⇒ **${a}**`), '',
].join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'KEY-v7.md'), [
  '# KEY v7（冻结：真值 / 诱饵 / 判错点）', '',
  ...rows.map(({ d, sha }) => `- **${d.id}**（${d.type}）真值 **${d.truth}** · 诱饵 **${d.bait}** · 料的 sha \`${sha}\`\n  - 判错点：${d.fault}`), '',
  '> 纪律：本文件生成后冻结；读者或我若有有道理的挑战，只记进 `challenges.md`，**不动本文件**。',
].join('\n'), 'utf8');
// —— ① 仓位复现（**回环**：把刚写出去的日文件读回来，重算一遍再比）——
// 为什么是回环而不是自比：内存里的值自比永远成立；只有"写出去 → 读回来"才能抓住写/读形状不一致。
let rt = 0;
for (const { d } of rows) {
  const t = fs.readFileSync(path.join(OUT, 'days', `${d.id}.md`), 'utf8');
  const sig = Number((t.match(/signal = \+([\d.]+)%/) || [])[1]);
  const trigs = [...t.matchAll(/^- (R\d)：按记录触发（乘子 ×/gm)].map((m) => m[1]);
  const caps = [...t.matchAll(/^- (R\d)：按记录触发（上限 /gm)].map((m) => m[1]);
  const stated = Number((t.match(/\*\*算出的仓位\*\*：([\d.]+)%/) || [])[1]);
  const rec = build({ signal: sig, trig: trigs, caps });
  if (!(Math.abs(rec.w - stated) < 5e-4 && trigs.length + caps.length === d.trig.length + d.caps.length)) {
    rt++; console.log(`!! ① 回环失败 ${d.id}: 重算 ${rec.w.toFixed(4)}% ≠ 文件 ${stated}% · 触发 ${trigs.length}+上限 ${caps.length}`);
  }
}
console.log(`\n① 仓位复现（日文件读回来重算）：不一致 ${rt}`);
bad += rt;

console.log(`\n落盘：${path.relative(ROOT, OUT)}/  （8 天 + RUBRIC.md + KEY-v7.md）· 判据 ${bad === 0 ? '全过' : `未过 ${bad} 条`}`);
