// make-arm8.mjs —— 第三套语料 v8（10 天 × 8 规则）：**按可达性审计重建**。
//
// 与 v7 的三条差别（都是上一轮教训换来的）：
//   ① **判错点依赖的每个数/词，都必须明写在日文件里**（v7 有 3 格做不到 ⇒ 读者判不出来）；
//   ② **KEY 的散文只许引用料里的数**（v0 有 2 格散文算术与料不符）—— 落盘前由 check-key-reachability.mjs 当闸门；
//   ③ **两类天按构造分开**：
//      · **A 类「判据直接违背」**：料同页写着规则自己的条件为假（财报 4 日后却触发 R5、成交额 $48B 却触发 R6…）
//      · **B 类「判据字面成立、但结论需判断」**：条件逐条为真，判错点在**序列**上（衰竭 / 板块已回落）——**且这些数也明写在料里**
//      · **C 类「无咎」** 1 天（真值 NONE），用来防"全答某条规则"的退化解
//
// 判据（生成器自报，任一条不过 ⇒ exit 3 拒绝落盘）：
//   ① 仓位复现（回环：把写出去的日文件读回来重算）
//   ② 有真值的天：改真值 ⇒ 当天变好（Δpp > 0）
//   ③ 每份料的 sha 打印
//   ④ **可达性**：由 check-key-reachability.mjs 在开火前单独跑（本脚本只保证 ①②③）
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const OUT = path.join(ROOT, 'arms/v8');
const FACTOR = { R1: 0.3, R2: 0.7, R3: 0.4, R4: 1.2, R7: 1.1, R8: 0.6 };
const CAP = { R5: 2, R6: 1 };
const RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

const DAYS = [
  // ——— A 类：判据直接违背（料同页写着条件为假）· 全是"该赚没赚" ⇒ 真值 = 被误用的折扣/上限 ———
  { id: 'day-01', cls: 'A', type: '该赚没赚', ticker: 'AMD', signal: 2.4, move: 1.6, news: '个股新闻，方向：正面（数据中心订单）',
    ret20: 3.9, vsMA50: 0.8, vix: 22.4, vixPrev: 22.1, advM: 35, earningsDays: 4, streak: 2, sector: '半导体', sectorSame: 1,
    sectorNote: '同板块仅本只上涨', trig: ['R2'], caps: ['R5'], nextMove: 4.8, truth: 'R5', bait: 'R2',
    fault: 'R5 要求「财报在 3 日内」，而**同页明写：财报在 4 日后** ⇒ 上限 2% 本不该生效（判据与记录直接冲突，读者只需读两行）' },
  { id: 'day-02', cls: 'A', type: '该赚没赚', ticker: 'JPM', signal: 2.2, move: 1.4, news: '个股新闻，方向：正面（净息差指引）',
    ret20: 2.6, vsMA50: 0.5, vix: 20.1, vixPrev: 20.6, advM: 48, earningsDays: null, streak: 1, sector: '银行', sectorSame: 1,
    sectorNote: '同板块仅本只上涨', trig: [], caps: ['R6'], nextMove: 5.0, truth: 'R6', bait: 'R5',
    fault: 'R6 要求「日均成交额 < $20M」，而**同页明写：日均成交额 $48B** ⇒ 上限 1% 本不该生效' },
  { id: 'day-03', cls: 'A', type: '该赚没赚', ticker: 'META', signal: 2.0, move: 1.3, news: '个股新闻，方向：正面（独家内容合约）',
    ret20: 1.4, vsMA50: 0.2, vix: 24.6, vixPrev: 24.1, advM: 47, earningsDays: null, streak: 1, sector: '互联网', sectorSame: 1,
    sectorNote: '同板块仅本只上涨；板块指数当日 +0.1%', trig: ['R3'], caps: [], nextMove: 4.4, truth: 'R3', bait: 'R4',
    fault: 'R3 只对「泛市场消息」打折 ×0.4，而**同页明写：这是该公司独家合约、板块指数 +0.1%、同板块仅本只上涨** ⇒ 泛市场前提为假' },
  { id: 'day-04', cls: 'A', type: '该赚没赚', ticker: 'COST', signal: 2.6, move: 2.4, news: '个股新闻，方向：正面（会员续费率）',
    ret20: 2.2, vsMA50: 0.6, vix: 19.8, vixPrev: 20.2, advM: 21, earningsDays: null, streak: 1, sector: '零售', sectorSame: 1,
    sectorNote: '同板块仅本只上涨', trig: ['R1'], caps: [], nextMove: 4.6, truth: 'R1', bait: 'R2',
    fault: 'R1 要求「|当日涨跌| > 3% **且方向与新闻相悖**」，而**同页明写：当日 +2.4%、方向与正面新闻一致** ⇒ 两个条件都不成立' },
  { id: 'day-05', cls: 'A', type: '该赚没赚', ticker: 'ORCL', signal: 1.8, move: 0.4, news: '个股新闻，方向：正面（云迁移）',
    ret20: 1.1, vsMA50: 0.1, vix: 23.2, vixPrev: 23.6, advM: 29, earningsDays: null, streak: 3, sector: '软件', sectorSame: 1,
    sectorNote: '同板块仅本只上涨；近 5 日：+0.8% · **−0.3%** · +0.5% · +0.6% · +0.4% ⇒ 连涨 3 日',
    trig: ['R8'], caps: [], nextMove: 3.9, truth: 'R8', bait: 'R3',
    fault: 'R8 要求「连涨 ≥4 日」，而**同页明写：近 5 日中含一天 −0.3%，实际连涨 3 日** ⇒ 折扣本不该生效' },

  // ——— B 类：判据字面成立、结论需判断（序列/衰竭）· 全是亏损日 ⇒ 真值 = 被误用的放大 ———
  { id: 'day-06', cls: 'B', type: '亏损日', ticker: 'NVDA', signal: 3.4, move: 4.9, news: '个股新闻，方向：正面（交付超预期）',
    ret20: 9.1, vsMA50: 4.6, vix: 27.8, vixPrev: 26.1, advM: 52, earningsDays: null, streak: 5, sector: '半导体', sectorSame: 1,
    sectorNote: '同板块仅本只上涨；近 5 日涨幅：+7.2% · +6.4% · +5.8% · +6.1% · **当日 +4.9%**（前 4 日均值 **6.4%**）',
    trig: ['R4', 'R8'], caps: [], nextMove: -4.2, truth: 'R4', bait: 'R8',
    fault: 'R4 的两条条件字面成立（20 日 +9.1% > 5%、收盘高于 MA50 4.6%），但**同页给出的近 5 日涨幅显示动能已延伸**（当日 +4.9% 低于前 4 日均值 6.4%）⇒ 在延伸走势上放大与事实相悖' },
  { id: 'day-07', cls: 'B', type: '亏损日', ticker: 'AVGO', signal: 2.6, move: 2.6, news: '个股新闻，方向：正面（新客户）',
    ret20: 6.2, vsMA50: 2.8, vix: 21.4, vixPrev: 21.0, advM: 31, earningsDays: null, streak: 2, sector: '半导体', sectorSame: 2,
    sectorNote: '同板块 3 只、2 只同向；其中**领涨那只当日冲高回落 −2.4%**',
    trig: ['R7'], caps: [], nextMove: -3.1, truth: 'R7', bait: 'R4',
    fault: 'R7 的「同板块 ≥2 只同向」字面成立，但**同页明写领涨那只当日冲高回落 −2.4%** ⇒ 板块联动不成立，加成与事实相悖' },
  { id: 'day-08', cls: 'B', type: '亏损日', ticker: 'TSLA', signal: 3.0, move: 4.6, news: '个股新闻，方向：正面（交付）',
    ret20: 8.4, vsMA50: 4.1, vix: 26.9, vixPrev: 25.8, advM: 55, earningsDays: null, streak: 5, sector: '汽车', sectorSame: 1,
    sectorNote: '同板块仅本只上涨；近 5 日涨幅：+8.0% · +7.1% · +6.6% · +5.9% · **当日 +4.6%**（前 4 日均值 **6.9%**）',
    trig: ['R4', 'R8'], caps: [], nextMove: -5.1, truth: 'R4', bait: 'R8',
    fault: 'R4 条件字面成立，但**同页的涨幅序列显示当日涨幅低于前 4 日均值 6.9%** ⇒ 动能衰减处加成与事实相悖' },
  { id: 'day-09', cls: 'B', type: '亏损日', ticker: 'MU', signal: 2.2, move: 2.1, news: '个股新闻，方向：正面（涨价）',
    ret20: 5.6, vsMA50: 2.2, vix: 22.8, vixPrev: 22.3, advM: 26, earningsDays: null, streak: 4, sector: '半导体', sectorSame: 2,
    sectorNote: '同板块 4 只、2 只同向；**领涨那只尾盘跳水 −3.1%**；板块指数收 −0.6%',
    trig: ['R4', 'R7', 'R8'], caps: [], nextMove: -3.6, truth: 'R7', bait: 'R4',
    fault: 'R7 字面成立，但**同页明写领涨那只尾盘跳水 −3.1%、板块指数收 −0.6%** ⇒ 板块联动已反转，加成与事实相悖' },

  // ——— C 类：无咎（真值 NONE）———
  { id: 'day-10', cls: 'C', type: '无咎日', ticker: 'XOM', signal: 2.0, move: 1.6, news: '泛市场新闻，方向：正面（能源价格）',
    ret20: 3.4, vsMA50: 1.8, vix: 31.2, vixPrev: 33.8, advM: 26, earningsDays: 6, streak: 2, sector: '能源', sectorSame: 1,
    sectorNote: '同板块仅本只上涨', trig: [], caps: [], nextMove: -2.6, truth: 'NONE', bait: 'R4',
    fault: '无判错点：每条规则的读数都在门槛外或条件成立；亏损来自**收盘后一条行业政策新闻**，记录内无任何东西能预示' },
];

const pp = (d, w) => (w / 100) * d.nextMove;
function build(d) {
  let mult = 1, capNote = '';
  for (const R of Object.keys(FACTOR)) if (d.trig.includes(R)) mult *= FACTOR[R];
  let w = Math.max(0, Math.min(4 * d.signal * mult, 15));
  for (const R of RULES) if (d.caps.includes(R) && w > CAP[R]) { w = CAP[R]; capNote = `（${R} 上限 ${CAP[R]}%）`; }
  return { mult, w, capNote };
}
function edit(d, R, sem) {
  const b = build(d);
  const capFired = d.caps.includes(R), multFired = d.trig.includes(R), fired = capFired || multFired;
  const pos = (mult, capsList) => { let w = Math.max(0, Math.min(4 * d.signal * mult, 15)); for (const C of capsList) w = Math.min(w, CAP[C]); return w; };
  const without = () => pos(multFired ? b.mult / FACTOR[R] : b.mult, d.caps.filter((c) => c !== R));
  if (sem === 'E1') return fired ? { w: without() } : { w: b.w };
  if (fired) return { w: without() };
  if (R === 'R5' || R === 'R6') return { w: pos(b.mult, [...d.caps, R]) };
  return { w: pos(b.mult * FACTOR[R], d.caps) };
}

let bad = 0; const rows = [];
for (const d of DAYS) {
  const b = build(d);
  const sha = crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 8);
  let note;
  if (d.truth === 'NONE') note = 'n/a（真值 NONE）';
  else {
    const delta = pp(d, edit(d, d.truth, 'E2').w) - pp(d, b.w);
    note = `改 ${d.truth} ⇒ Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(4)}pp ${delta > 0 ? '✅' : '❌ 不改善'}`;
    if (!(delta > 0)) { bad++; }
  }
  rows.push({ d, b, note, sha });
  console.log(`${d.id} [${d.cls}/${d.type}] ${d.ticker} 仓位 ${b.w.toFixed(4)}%${b.capNote} · 次日 ${d.nextMove >= 0 ? '+' : ''}${d.nextMove}% · ${pp(d, b.w).toFixed(4)}pp · ${note} · 料 ${sha}`);
}
if (bad) { console.log(`\n!! 判据 ② 未过 ${bad} 条 ⇒ 拒绝落盘`); process.exit(3); }

fs.mkdirSync(path.join(OUT, 'days'), { recursive: true });
for (const { d, b } of rows) {
  fs.writeFileSync(path.join(OUT, 'days', `${d.id}.md`), [
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
    '**问题**：这一天最该被改的是哪一条规则（改哪一条最可能防止这次亏损）？只报一个编号，或 `NONE`。', '',
  ].join('\n'), 'utf8');
}
fs.writeFileSync(path.join(OUT, 'RUBRIC.md'), [
  '# 规则集（v8 · 8 条）', '', '仓位口径（唯一）：`clip(4 × signal × Π乘子, 0, 15%)`，再依次套用上限。', '',
  ...[['R1', '当日 |涨跌| > 3% **且方向与新闻相悖**', '×0.3'], ['R2', 'VIX > 25', '×0.7（前一日更高=回落中 ⇒ 不打折）'],
      ['R3', '消息为**泛市场**消息', '×0.4'], ['R4', '20 日收益 > +5% 且收盘 > MA50', '×1.2'],
      ['R5', '**财报在 3 日内**', '上限 2%'], ['R6', '**日均成交额 < $20M**', '上限 1%'],
      ['R7', '同板块 ≥2 只同向', '×1.1'], ['R8', '**连涨 ≥4 日**', '×0.6']].map(([r, c, a]) => `- **${r}**：${c} ⇒ **${a}**`), '',
].join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'KEY-v8.md'), [
  '# KEY v8（冻结：真值 / 诱饵 / 判错点）', '',
  '> 构造纪律：每一条判错点所依赖的数/词，**都明写在对应日文件里**（v8 就是照这条重建的）。',
  '> 纪律：本文件生成后冻结；有道理的挑战只记进 `challenges.md`，**不动本文件**。', '',
  ...rows.map(({ d, sha }) => `- **${d.id}**（${d.cls} 类 · ${d.type}）真值 **${d.truth}** · 诱饵 **${d.bait}** · 料的 sha \`${sha}\`\n  - 判错点：${d.fault}`), '',
].join('\n'), 'utf8');
console.log(`\n落盘：arms/v8/（10 天 + RUBRIC.md + KEY-v8.md）· 判据 ①②③ 过 · ⚠️ 开火前必须先过可达性审计`);
