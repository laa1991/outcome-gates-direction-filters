// cold-run.mjs —「干净读者」跑批器（零记忆 · 独立会话 · 只落盘答案文件）
//
// 为什么有它：子会话读者继承发起者的工作区 ⇒ 它们带着 operator 的 durable memory
// （实测一位读者窗口里有 246 条 memory/fact）+ 线标签 + 声呐收件箱。headless 一次性运行器
// 不吃这些（实测同一探针 0 条 memory/fact、会话 42 KB vs 210 KB）。
//
// 用法：
//   node cold-run.mjs --material . --out arms/cold-v0/runs --days day-01,day-02 --slots A,B
//   node cold-run.mjs --dry            # 只打印第一格的完整提示词，不真跑
//
// 判据（脚本自己打印，不看我说得对不对）：末行 `cells=N written=M skipped=K`，
// 且每格有一行 `ok/miss` + 用时 + FAULT 原文。M < N 时不许把该格记成任何数字。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.env.PAPER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.');
const REPO = process.env.DSH_REPO || '';
const CLI = path.join(REPO, 'apps/cli/src/bin.ts');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const DRY = argv.includes('--dry');

const material = path.resolve(ROOT, arg('--material', '.'));
const outDir = path.resolve(ROOT, arg('--out', 'arms/cold-v0/runs'));
const days = arg('--days', 'day-01,day-02,day-03,day-04,day-05').split(',').map((s) => s.trim()).filter(Boolean);
const slots = arg('--slots', 'A,B').split(',').map((s) => s.trim()).filter(Boolean);
const timeoutMs = Number(arg('--timeoutMs', '300000'));

// 固定题面（逐字，与 prompt.md 同源；只把 {OUT} 换成真路径）
// `--prompt <file>`：换一份题面（取第一个 `---` 之后的部分当正文，`{OUT}` 会被替换）。
//   用于「臂 ④-收口」那类**只动题面一格**的实验（其余一切逐字不变）。
const promptBody = arg('--prompt', null)
  ? fs.readFileSync(path.resolve(ROOT, arg('--prompt')), 'utf8').split(/^---\s*$/m).pop().trim()
  : null;
const promptFor = (rubric, dayFile, outFile) => (promptBody
  ? `${promptBody.replace('{OUT}', outFile)}

只读这两个文件：
- ${rubric}
- ${dayFile}
`
  : `你是一个自进化交易系统的审计员。下面给你两样东西：

1. 规则集（RUBRIC.md）：系统当前生效的"条件 → 动作"规则，以及仓位是怎么算出来的（唯一口径）。
2. 某一天的完整记录：当天的市场事实、当天逐条触发的规则与读数、算出来的仓位、以及结果。

任务：判断这一天最该被改的是哪一条规则 —— 也就是说，改哪一条最可能防止这一天的亏损。

- 只报一个规则的编号（R1–R6）。
- 若你判断没有任何规则可改（这一天的亏损来自记录之外、当天每条规则在它的事实下都成立），报 NONE。
- 不要复述规则集，不要写分析过程之外的内容。

输出恰好两行，写进答案文件：

FAULT: <R1|R2|R3|R4|R5|R6|NONE>
WHY: <一句话；必须引用记录里的某个具体数字>

只读这两个文件：
- ${rubric}
- ${dayFile}

答案文件：${outFile}
`);

fs.mkdirSync(outDir, { recursive: true });
const rubric = path.resolve(ROOT, arg('--rubric', path.join(material, 'RUBRIC.md')));
if (!fs.existsSync(rubric)) {
  console.error(`missing RUBRIC.md — refuse to run: ${rubric}`);
  process.exit(3);
}
console.log(`rubric=${rubric}  sha=${crypto.createHash('sha256').update(fs.readFileSync(rubric)).digest('hex').slice(0, 8)}`);

const cells = [];
for (const d of days) for (const s of slots) cells.push({ d, s });

if (DRY) {
  const outFile = path.join(outDir, `${days[0]}-${slots[0]}.md`);
  console.log(`material=${material}\nout=${outDir}\ncells=${cells.length}\n--- prompt of ${days[0]}-${slots[0]} ---`);
  console.log(promptFor(rubric, path.join(material, 'days', `${days[0]}.md`), outFile));
  process.exit(0);
}

let written = 0;
let skipped = 0;
const t0 = Date.now();
for (const { d, s } of cells) {
  const dayFile = path.join(material, 'days', `${d}.md`);
  const outFile = path.join(outDir, `${d}-${s}.md`);
  if (!fs.existsSync(dayFile)) { console.log(`${d}-${s}  skip  no material ${dayFile}`); skipped++; continue; }
  if (fs.existsSync(outFile)) { console.log(`${d}-${s}  skip  slot taken (never overwrite a peer's slot)`); skipped++; continue; }

  // ⚠️ `--session` 是一个**会续写**的身份（night-pass 正是靠它"每趟接着写"）⇒ 会话名必须把
  // 「哪份料」编进去，否则第二批会静默**接着**上一批那位读者写（带着它上一次的答案）。
  const tag = arg('--tag', `${path.basename(material)}-${path.basename(outDir)}`);
  const session = `cold-${tag}-${d}-${s}`.replace(/[^A-Za-z0-9._-]/g, '_');
  const started = Date.now();
  const run = spawnSync(process.execPath, ['--import', 'tsx/esm', CLI, '--profile', 'headless', '--session', session, promptFor(rubric, dayFile, outFile)], {
    cwd: REPO, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
  });
  const sec = Math.round((Date.now() - started) / 1000);
  const ok = fs.existsSync(outFile);
  if (ok) written++;
  const fault = ok ? (fs.readFileSync(outFile, 'utf8').split('\n').find((l) => l.startsWith('FAULT:')) ?? '(no FAULT line)') : '(no file)';
  const daySha = crypto.createHash('sha256').update(fs.readFileSync(dayFile)).digest('hex').slice(0, 8);
  console.log(`${d}-${s}  ${ok ? 'ok  ' : 'miss'}  ${String(sec).padStart(3)}s  exit=${run.status}  ${fault.trim()}  [料 ${daySha}]`);
}
console.log(`cells=${cells.length} written=${written} skipped=${skipped} total=${Math.round((Date.now() - t0) / 1000)}s`);
