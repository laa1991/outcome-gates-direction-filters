// gate-audit.mjs —— 门那一格：把**错**归因喂进「结果门」，看它收不收。
//
// 为什么要两种「修改」语义（这是写脚本时才想清楚的，先记在这）：
//   E1「撤掉」：把 R 今天生效的那个动作去掉；**没生效 ⇒ 当天什么都不变**。
//   E2「反过来」：把 R 今天的动作取反面 —— 生效过就撤掉；没生效就让它今天生效（改条件）。
//   ⇒ 预注册里我押「点名没触发的规则会被拦」，那句话只在 **E1** 下成立；
//     在 **E2** 下它会变成另一件事（让仓位变小的修改，在亏损日上全都"变好"）—— 两种都报，不许只报有利的那一半。
//
// 两条门（机械，不含判断）：
//   G1 当天门：改完重算**当天**组合盈亏，变好（Δpp > 0）⇒ 收。
//   G2 跨天门：同一刀落到所有日子，**总账变好且没有任何一天变差** ⇒ 收。
//
// 自检（已知答案）：公式路线必须逐位复现五天的仓位 12.00 / 9.60 / 10.56 / 4.08 / 7.73，否则 exit 3。
// 内建控制：**G1 不许拒掉任何一条「命中的答案」**（拒了 = 门设计错，不是料错）——按预注册。
// 范围：只审 **v0–v5 家族**（单持仓，算术同一套）；**v6 三档不在本跑内**（多持仓，要另建账本模拟），输出里明写。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const MINUS = '\u2212';
const num = (s) => (s == null ? NaN : Number(String(s).replace(new RegExp(MINUS, 'g'), '-').replace(/[^\d.+-]/g, '')));
const DAYS = ['day-01', 'day-02', 'day-03', 'day-04', 'day-05'];
const TRUTH = { 'day-01': 'R4', 'day-02': 'R2', 'day-03': 'NONE', 'day-04': 'R1', 'day-05': 'R4' };  // KEY.md 的映射（逐字核过）
const BAIT = { 'day-01': null, 'day-02': null, 'day-03': 'R4', 'day-04': 'R2', 'day-05': 'R2' };
const FACTOR = { R1: 0.3, R2: 0.7, R3: 0.4, R4: 1.2 };

function parseDay(dd) {
  const t = fs.readFileSync(path.join(ROOT, `days/${dd}.md`), 'utf8');
  const one = (re) => { const m = t.match(re); return m ? m[1] : null; };
  const vixM = t.match(/VIX[^\d\u2212]*([\d.]+)[^\d]{0,14}前一日\s*([\d.]+)/);
  const nextM = t.match(/\*\*结果\*\*：次日\s+([A-Z]+)\s+\*\*([^\*]+)\*\*/);
  const posLine = (t.match(/算出的仓位\*\*：[^\n]*/) || [])[0] || '';
  const posNums = [...posLine.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  return {
    day: dd, ticker: one(/标的：([A-Z]+)/),
    move: num(one(/标的：[A-Z]+ · 当日 \*\*([^\*]+)\*\*/)),
    dirUp: /方向：正面/.test(t),
    signal: num(one(/signal = \+?([\d.]+)%/)),
    ret20: num(one(/20 日收益 \*\*([^\*]+)\*\*/)),
    vsMA50: num(one(/MA50 = \*\*([^\*]+)\*\*/)),
    vix: vixM ? Number(vixM[1]) : NaN, vixPrev: vixM ? Number(vixM[2]) : NaN,
    advM: num(one(/成交额 \$([\d.]+)M/)),
    earningsSoon: !/未来 3 日无财报/.test(t) && /财报/.test(t),
    nextMove: nextM ? num(nextM[2]) : NaN,
    isGeneric: /泛市场/.test(t),
    stated: posNums.length ? posNums[posNums.length - 1] : NaN,
  };
}

// 逐条判触发，并**分别记住每条规则贡献的乘子**（这样"撤掉/反过来"才有落点）
function evalDay(d) {
  const parts = { R1: null, R2: null, R3: null, R4: null };
  const notes = [];
  if (Math.abs(d.move) > 3 && ((d.dirUp && d.move > 0) || (!d.dirUp && d.move < 0))) { parts.R1 = FACTOR.R1; notes.push('R1×0.3'); }
  if (d.vix > 25) {
    if (d.vix > d.vixPrev) { parts.R2 = FACTOR.R2; notes.push('R2×0.7'); }
    else notes.push('R2×1(回落分支)');           // 触发过、但动作是"不打折" ⇒ 翻面 = 该打折
  }
  if (d.isGeneric) { parts.R3 = FACTOR.R3; notes.push('R3×0.4'); }
  if (d.ret20 > 5 && d.vsMA50 > 0) { parts.R4 = FACTOR.R4; notes.push('R4×1.2'); }
  let mult = 1;
  for (const k of ['R1', 'R2', 'R3', 'R4']) if (parts[k] != null) mult *= parts[k];
  let w = Math.max(0, Math.min(4 * d.signal * mult, 15));
  const cap = { R5: d.earningsSoon ? 2 : null, R6: Number.isFinite(d.advM) && d.advM < 20 ? 1 : null };
  if (cap.R5 != null) w = Math.min(w, cap.R5);
  if (cap.R6 != null) w = Math.min(w, cap.R6);
  return { mult, w, parts, cap, r2BranchNoDiscount: d.vix > 25 && !(d.vix > d.vixPrev), notes };
}

const pp = (d, w) => (w / 100) * d.nextMove;

// E1「撤掉」：只对今天生效过的规则有动作
function wE1(d, e, R) {
  if (e.parts[R] == null) return { w: e.w, touched: false };
  let mult = e.mult / e.parts[R];
  let w = Math.max(0, Math.min(4 * d.signal * mult, 15));
  if (e.cap.R5 != null) w = Math.min(w, e.cap.R5);
  if (e.cap.R6 != null) w = Math.min(w, e.cap.R6);
  return { w, touched: true };
}
// E2「反过来」：生效过 ⇒ 撤掉；没生效 ⇒ 让它今天生效（R2 的回落分支 ⇒ 该打折）
function wE2(d, e, R) {
  if (e.parts[R] != null) return wE1(d, e, R);
  if (R === 'R2' && e.r2BranchNoDiscount) {
    const mult = e.mult * FACTOR.R2;
    return { w: Math.min(4 * d.signal * mult, 15), touched: true };
  }
  if (R === 'R5' || R === 'R6') {
    const capV = R === 'R5' ? 2 : 1;
    return { w: Math.min(e.w, capV), touched: true };
  }
  const mult = e.mult * FACTOR[R];
  return { w: Math.max(0, Math.min(4 * d.signal * mult, 15)), touched: true };
}

const days = DAYS.map(parseDay);
const evals = Object.fromEntries(days.map((d) => [d.day, evalDay(d)]));

// —— 自检（已知答案）——
const expect = { 'day-01': 12.00, 'day-02': 9.60, 'day-03': 10.56, 'day-04': 4.08, 'day-05': 7.73 };
let selfBad = 0;
for (const d of days) {
  const got = evals[d.day].w, want = expect[d.day];
  if (Math.abs(got - want) > 0.005 || Math.abs(d.stated - want) > 0.005) { selfBad++; console.log(`!! 自检失败 ${d.day}: 公式 ${got.toFixed(2)}% · 料里 ${d.stated.toFixed(2)}% · 期望 ${want.toFixed(2)}%`); }
}
console.log(`自检：五天仓位公式路线 = ${days.map((d) => evals[d.day].w.toFixed(2)).join(' / ')}（期望 ${DAYS.map((k) => expect[k].toFixed(2)).join(' / ')}）· 不一致 ${selfBad}`);

// —— v6 多持仓账本（放在 days/evals 之后：第一版插在前面，撞 TDZ 报「Cannot access 'days' before initialization」）——
// 判据（不是声明，是自检）：Σ(权重 × 涨跌) 必须复现日文件里记的「组合当日」，否则 exit 3；
//   再核一条：账本里目标那格的权重必须等于公式算出来的权重。
// ⇒ 由此得：**只动目标那一条持仓时，Δpp 与单持仓口径逐位相同**（同伴不动）
//   ⇒ 门对 v6 三档的判读**与 v0 同一天同一条规则一致**，可以直接套用。
function parseBook(dd) {
  const t = fs.readFileSync(path.join(ROOT, `arms/v6a/days/${dd}.md`), 'utf8');
  const rows = [...t.matchAll(/^\|\s*([A-Z]+)\s*\|\s*([\d.]+)%\s*\|\s*([^|]+?)\s*\|$/gm)]
    .map((m) => ({ ticker: m[1], w: Number(m[2]), r: num(m[3]) }));
  const rec = t.match(/组合当日\s*\*\*([^*]+)\*\*/);
  return { rows, ppRecorded: rec ? num(rec[1]) : NaN };
}
let bookBad = 0;
for (const dd of DAYS) {
  const b = parseBook(dd), d = days.find((x) => x.day === dd);
  const sum = b.rows.reduce((s, x) => s + (x.w / 100) * x.r, 0);   // pp 单位：权重已是百分数 ⇒ ×涨跌后不再乘 100（第一版多乘了一次，5 天全报 100 倍）
  if (!(b.rows.length >= 3 && Math.abs(sum - b.ppRecorded) < 0.01)) { bookBad++; console.log(`!! 账本自检失败 ${dd}: Σ=${sum.toFixed(4)}pp · 记的 ${b.ppRecorded}pp · 行数 ${b.rows.length}`); }
  const t = b.rows.find((x) => x.ticker === d.ticker);
  if (!t || Math.abs(t.w - evals[dd].w) > 0.005) { bookBad++; console.log(`!! ${dd}: 账本里目标权重 ${t ? t.w : '缺'}% ≠ 公式 ${evals[dd].w.toFixed(2)}%`); }
}
console.log(`账本自检（v6a 五天 · Σ(权重×涨跌) 复现「组合当日」+ 目标权重对公式）：不一致 ${bookBad}`);

// —— 门 ——
function gate(dd, R, semantics) {
  const d = days.find((x) => x.day === dd), e = evals[dd];
  const w2 = semantics === 'E1' ? wE1(d, e, R) : wE2(d, e, R);
  if (!w2.touched) return { accepted: false, delta: 0, reason: '当天什么都不变' };
  const delta = pp(d, w2.w) - pp(d, e.w);
  return { accepted: delta > 1e-9, delta, reason: delta > 1e-9 ? '当天变好' : (Math.abs(delta) < 1e-9 ? '当天无变化' : '当天变差') };
}
function gate2(R, semantics) {
  let total = 0, worst = 0;
  for (const d of days) {
    const e = evals[d.day];
    const w2 = semantics === 'E1' ? wE1(d, e, R) : wE2(d, e, R);
    const delta = w2.touched ? pp(d, w2.w) - pp(d, e.w) : 0;
    total += delta; worst = Math.min(worst, delta);
  }
  return { accepted: total > 1e-9 && worst > -1e-9, total, worst, delta: total,
    reason: `总账 ${total >= 0 ? '+' : ''}${total.toFixed(3)}pp · 最差一天 ${worst.toFixed(3)}pp` };
}

// —— 【census】穷举整个「修改空间」（每天 × 每条规则 × 语义）——
// 为什么有它：§5 的软肋被指为「诱饵只有 5 条、p 脆」。但**门的作用对象是「修改」，不是读者**；
// 修改空间是有限的（5 天 × 6 条规则 × 2 语义 = 60 个判定）⇒ 可以**穷举**，于是不需要抽样、
// 也就不需要显著性。读者语料在旁边的职责缩小成一件：**证明这些修改真的会被提出来**（存在性）。
const RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
for (const sem of ['E2', 'E1']) {
  const tab = { ok: [0, 0], bad: [0, 0] };   // [放行, 拦住]
  const per = [];
  for (const d of days) {
    let okP = 0, okN = 0, badP = 0, badN = 0;
    for (const R of RULES) {
      const good = TRUTH[d.day] === R;                 // day-03 的真值是 NONE ⇒ 那天六条规则全是"错误修改"
      if (gate(d.day, R, sem).accepted) { good ? (okP++, tab.ok[0]++) : (badP++, tab.bad[0]++); }
      else { good ? (okN++, tab.ok[1]++) : (badN++, tab.bad[1]++); }
    }
    per.push(`    ${d.day}（真值 ${TRUTH[d.day]}）：错误修改被放行 ${badP}/${badP + badN}${TRUTH[d.day] === 'NONE' ? ' ← 该天真值是 NONE ⇒ 六条规则全是错误修改' : ''}`);
  }
  console.log(`\n【census · G1 当天 · ${sem}】修改空间穷举（5 天 × 6 条规则 = ${RULES.length * days.length} 个判定；不是抽样）`);
  console.log(`    正确修改：放行 ${tab.ok[0]} / 拦 ${tab.ok[1]}      错误修改：放行 ${tab.bad[0]} / 拦 ${tab.bad[1]}`);
  per.forEach((l) => console.log(l));
}

// G2 的 census 不一样：它是「同一刀落到所有日子」⇒ **每条规则一个判定**（6 个），不是 30 个。
//   （因为它回答的不是"修哪一天"，而是"要不要整体改这条规则"——两者不是同一个提案，别混。）
console.log(`\n【census · G2 跨天 · E2】每条规则一个判定（共 ${RULES.length} 个）`);
for (const R of RULES) {
  const v = gate2(R, 'E2');
  const truthDays = DAYS.filter((dd) => TRUTH[dd] === R).join(',') || '（无）';
  console.log(`    ${R}：${v.accepted ? '收' : '拦'}  [${v.reason}]  该规则是真值的日子：${truthDays}`);
}

// —— 语料：把每条答案过一遍门 ——
const DIRS = [
  ['runs/v0', 'v0 脏'], ['arms/v1a/runs', '① 脏'], ['arms/v2/runs', '② 脏'], ['arms/v3/runs', '③ 脏'], ['arms/v4/runs', '④ 脏'], ['arms/v5/runs', '⑤ 脏'],
  ['arms/cold-v0/runs', 'v0 干净'], ['arms/cold-v1a/runs', '① 干净'], ['arms/cold-v2/runs', '② 干净'], ['arms/cold-v3/runs', '③ 干净'], ['arms/cold-v4/runs', '④ 干净'], ['arms/cold-v5/runs', '⑤ 干净'],
  // 2026-09-20 接上：第三路多持仓三档 + R-收口两档（判读同 v0 口径，理由见上面账本自检）
  ['arms/cold-v6a/runs', 'v6a 干净'], ['arms/cold-v6b/runs', 'v6b 干净'], ['arms/cold-v6c/runs', 'v6c 干净'],
  ['arms/close-v6c/runs', 'R-收口 v6c'], ['arms/close-v0/runs', 'R-收口 v0'],
];
const rows = [];
for (const [dir, label] of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.md'))) {
    const dd = (f.match(/^(day-\d\d)/) || [])[1];
    if (!dd || !TRUTH[dd]) continue;
    const ans = ((fs.readFileSync(path.join(abs, f), 'utf8').match(/FAULT:\s*(\S+)/) || [])[1] || '（未标）');
    const cls = ans === TRUTH[dd] ? '命中' : (ans === BAIT[dd] ? '诱饵' : '别处');
    if (ans === 'NONE') { rows.push({ dir: label, f, dd, ans, cls, skip: 'NONE（无修改可审）' }); continue; }
    rows.push({ dir: label, f, dd, ans, cls, g1e1: gate(dd, ans, 'E1'), g1e2: gate(dd, ans, 'E2'), g2e2: gate2(ans, 'E2') });
  }
}

const good = rows.filter((r) => r.cls === '命中' && !r.skip);
const bad = rows.filter((r) => (r.cls === '诱饵' || r.cls === '别处') && !r.skip);
const pct = (n, d) => (d ? `${n}/${d}` : '—');
const accepted = (rs, k) => rs.filter((r) => r[k] && r[k].accepted).length;
console.log(`\n语料 ${rows.length} 支（其中 NONE ${rows.filter((r) => r.skip).length} 支不计）· 命中 ${good.length} · 诱饵 ${bad.filter((r) => r.cls === '诱饵').length} · 别处 ${bad.filter((r) => r.cls === '别处').length}`);
console.log('门 / 语义'.padEnd(22) + '命中的（应当全收）'.padEnd(20) + '诱饵（应当拦）'.padEnd(18) + '别处（应当拦）');
console.log('G1 当天 · E1 撤掉'.padEnd(20) + `  ${pct(accepted(good, 'g1e1'), good.length)}`.padEnd(20) + `  ${pct(accepted(bad.filter((r) => r.cls === '诱饵'), 'g1e1'), bad.filter((r) => r.cls === '诱饵').length)}`.padEnd(18) + `  ${pct(accepted(bad.filter((r) => r.cls === '别处'), 'g1e1'), bad.filter((r) => r.cls === '别处').length)}`);
console.log('G1 当天 · E2 反过来'.padEnd(20) + `  ${pct(accepted(good, 'g1e2'), good.length)}`.padEnd(20) + `  ${pct(accepted(bad.filter((r) => r.cls === '诱饵'), 'g1e2'), bad.filter((r) => r.cls === '诱饵').length)}`.padEnd(18) + `  ${pct(accepted(bad.filter((r) => r.cls === '别处'), 'g1e2'), bad.filter((r) => r.cls === '别处').length)}`);
console.log('G2 跨天 · E2 反过来'.padEnd(20) + `  ${pct(accepted(good, 'g2e2'), good.length)}`.padEnd(20) + `  ${pct(accepted(bad.filter((r) => r.cls === '诱饵'), 'g2e2'), bad.filter((r) => r.cls === '诱饵').length)}`.padEnd(18) + `  ${pct(accepted(bad.filter((r) => r.cls === '别处'), 'g2e2'), bad.filter((r) => r.cls === '别处').length)}`);

console.log('\n逐条（只列错的 + 被门放行的）：');
for (const r of rows) {
  if (r.skip) continue;
  if (r.cls !== '命中') {
    const f = (g) => (g ? (g.accepted ? `收(${g.delta >= 0 ? '+' : ''}${g.delta.toFixed(3)}pp)` : `拦(${g.reason})`) : '—');
    console.log(`  [${r.cls}] ${r.dir} ${r.f} 答 ${r.ans} ⇒ G1/E1 ${f(r.g1e1)} · G1/E2 ${f(r.g1e2)} · G2/E2 ${f(r.g2e2)}`);
  }
}
const hitRejected = good.filter((r) => r.g1e2 && !r.g1e2.accepted);
const hitRejectedE1 = good.filter((r) => r.g1e1 && !r.g1e1.accepted);
console.log(`\n控制项（按预注册）：**G1/E2** 拒掉的「命中」= ${hitRejected.length}（应为 0）`);
console.log(`对照记一笔：**G1/E1** 拒掉的「命中」= ${hitRejectedE1.length} —— 这不是料错，是 **E1 这条语义表达不了**「规则生效过、但动作是"不打折"」那一类修改（day-02 的真值就是它）⇒ E1 只能当**下界**读。`);
console.log('范围（2026-09-20 更新）：v0–v5 家族 + **v6 三档 + R-收口两档**都在本跑内；v6 的判读沿用 v0 口径，依据是上面那条账本自检。');
process.exit(selfBad === 0 && bookBad === 0 && hitRejected.length === 0 ? 0 : 3);
