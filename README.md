# Outcome Gates Are Direction Filters

### Under mechanical edit semantics: what result-based validation can and cannot catch

This repository carries a preprint and the reproducibility artifacts for a study of **outcome
gates**: validators that decide whether a proposed change to a trading position was right by
looking only at what the closed position did.

The claim is structural, and it is established by enumeration rather than by sampling. Under
mechanically defined edit semantics the space of proposals is finite, so what a gate can and
cannot see can be *counted*. Over four constructed corpora (792 proposals) and four edit
semantics, a gate that reads only the outcome admits exactly those proposals whose two
directions agree, and cannot distinguish a correct edit from a lucky one. A closed-form
argument and the enumeration agree cell by cell; that agreement is a self-consistency check,
not an independent validation.

## Contents

| Path | What it is |
|---|---|
| `paper/main.tex` | the paper source (xelatex; the figure is a vector PDF) |
| `paper/fig-direction-plane.pdf` | Figure 1, vector |
| `paper/outcome-gates-direction-filters.pdf` | the compiled paper (15 pages) |
| `artifacts/` | the reproducibility material: corpora, frozen answer keys, measurement devices, annotator transcripts (82 files) |
| `artifacts/README.md` | the artifacts' own note (written in an earlier framing; see *Note on titling*) |
| `MANIFEST.sha256` | sha256 of every file in this repository |

## Reproducing the readings

The devices resolve paths relative to their own location, so the artifact tree runs as
unpacked (set `PAPER_ROOT` to override):

```sh
cd artifacts
node gate-audit.mjs              # censuses over corpora A and B; reproduces the recorded positions from the published arithmetic
node check-key-reachability.mjs  # which day-cells are decidable at all (exits 3 when a criterion is unreachable)
node kappa-key-vs-annot.mjs      # agreement between the frozen key and the annotator majority (three known-answer self-checks printed on every run)
node make-arm8.mjs               # regenerates corpus C, printing its criteria before writing anything
```

The annotator transcripts under `artifacts/arms/annot-*/runs/` are the frozen output of reader
sessions; `artifacts/prompt-annotator.zh.md` is the annotator prompt verbatim (the deployment's
working language is Chinese).

## What this repository does not claim

- **No frequency claim.** The corpora are constructed; the counts are properties of the input
  space, not estimates of how often anything happens in a market.
- **The two checks are not independent.** The closed-form argument and the enumeration share the
  same arithmetic.
- **Agreement is reported as measured**, including its limits.

## License

- Text and data (the paper, the notes, the transcripts): **CC BY 4.0**
- Code (the `.mjs` devices): **Apache-2.0**

See `LICENSE.md`. The archive's own license field is CC BY 4.0.

## Note on titling

`artifacts/README.md` is the note that shipped with the frozen artifact set under the paper's
earlier working title, *"The Gate Sees Direction, Not Attribution"*. The artifact files are
reproduced here byte for byte (see `MANIFEST.sha256`); only this top-level README reflects the
current title.

## Citation

If you use this work, please cite the archived record. A DOI will be added here once the archive
is minted.

## Corrections

Please open an issue in this repository.
