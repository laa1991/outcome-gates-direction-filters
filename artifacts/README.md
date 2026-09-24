# Artifacts: The Gate Sees Direction, Not Attribution

This package accompanies the short paper of the same name. It carries the corpora, the frozen answer keys, the
measurement devices, and the annotator transcripts, so that every number in the paper can be re-derived.

## Layout (mirrors the working tree the devices expect)

- `days/`, `RUBRIC.md`, `KEY.md` -- corpus A (5 days, 6 rules; see `RUBRIC.md` for the rule set).
- `arms/v7/` -- corpus B (8 days, 8 rules). `arms/v8/` -- corpus C (10 days, 8 rules, every criterion readable).
- `arms/annot-v0|v7|v8/runs/` -- the frozen annotator transcripts (one file per cell; 45 files in total).
- `prompt-annotator.zh.md` -- the annotator prompt verbatim (working language of the deployment is Chinese; it asks
  one question: is any rule wrong on this day's facts?).
- `main.tex`, `abstract.txt` -- the paper source and the plain-text abstract.

## Devices

- `gate-audit.mjs` -- scorer and gate auditor: reproduces the recorded positions from the published arithmetic,
  checks the multi-position books, and prints the censuses of the paper.
- `make-arm7.mjs`, `make-arm8.mjs` -- corpus generators; they self-report their criteria and refuse to write
  anything if a criterion fails (position reproduction, "fixing the intended rule improves that day", hashes).
- `check-key-reachability.mjs` -- for each day-cell, whether the datum the intended answer needs is present in the
  material; exits 3 when a criterion is unreachable.
- `kappa-key-vs-annot.mjs` -- Cohen's kappa between the frozen key and the annotator majority, with three
  known-answer self-checks (0.6875 / 1 / 0) printed on every run.
- `cold-run.mjs` -- the runner that opens one clean reader session per cell (needs the deployment; the transcripts
  above are the frozen output of those sessions).

## Reproducing the readings

```
node gate-audit.mjs                    # the censuses of Section 3 (corpora A and B)
node check-key-reachability.mjs        # which day-cells are decidable at all
node kappa-key-vs-annot.mjs            # the agreement figures (kappa 0.504 / 0.714 / 0.674)
node make-arm8.mjs                     # regenerates corpus C, printing its criteria before writing
```

Paths are resolved relative to the file location, so the package runs as unpacked; set `PAPER_ROOT` to override.
The scorer prints the hash of the frozen key it used, so any reading can be tied to a key revision.

## License

Text (this paper and these notes): CC BY 4.0. Code (every `.mjs` device): Apache-2.0. The license chosen on the
arXiv submission form applies to the submission as a whole.
