# ADR 005 — Theme package security and import

## Status

Accepted for implementation.

## Package trust model

Theme packages are declarative data plus LaTeX templates/assets. Imported JavaScript, WASM, binaries, plugins, shell commands, and runtime Node dependencies are forbidden.

A conforming v2 package contains:

```text
manifest.json
scene.json
tokens.json
components/
assets/
integrity.json
```

The manifest declares every component, asset, dependency, preamble contribution, compiler requirement, compatibility range, and preview fixture. Integrity records contain normalized relative path, resource kind, byte length, and SHA-256.

## Validation

Reject before installation:

- absolute paths, `..`, empty components, backslashes where forbidden;
- duplicate normalized paths, undeclared/missing resources;
- symlinks escaping the staging root;
- executable files, JavaScript/WASM, unsupported MIME/encoding;
- file-count/byte/depth limit violations and archive expansion bombs;
- invalid ID/version/digest, dependency cycles or incompatible versions;
- unapproved compiler packages/preamble contributions.

Installation is atomic into an actor-owned Theme Library under Application Support. A package becomes visible only after complete semantic and integrity validation.

## Raw `.tex` and folder import

Nonconforming imports are staged and never executed during analysis. The importer inventories root TeX files, class/packages, input/include graph, body, assets/fonts/bibliography, cover/header/footer, heading/theorem/listing constructs, and unsafe primitives. Includes resolve only inside the chosen root.

The user maps recognized pieces to package slots. The importer emits a persistent compatibility report listing:

- recognized and converted constructs;
- unsupported constructs;
- unsafe/rejected files or commands;
- unresolved dependencies/assets;
- every dropped or approximated behavior.

No silent drops. Confirmation is required before creating the normalized package. Shell escape remains disabled; compilation occurs only from copied resources in an isolated Tectonic workspace.

## Template.zip conformance requirement

The repository root `Template.zip` is the mandatory lossless import fixture, not a best-effort sample. Import succeeds only when:

- every source, local package, include, macro and runtime asset required by its compile graph is preserved;
- its three cover components, page layout, colors, headings, header/footer, TikZ, tcolorbox/ex_test/vntcbox behavior and custom `.sty` logic remain exportable;
- recognized constructs become editable scene widgets/tokens;
- constructs not yet representable as widgets become protected declarative Raw LaTeX Components with their exact source/dependencies, editable through an expert source panel and included in export;
- generated build artifacts are classified and excluded with explicit report entries, never confused with dropped theme logic;
- the imported package compiles offline in the isolated engine and matches the original fixture using TeX/PDF/visual golden checks.

Importing a LaTeX document as Markdown is a separate explicitly lossy workflow; generated/imported TeX never becomes the canonical document.
