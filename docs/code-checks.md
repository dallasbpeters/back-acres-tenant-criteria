# Code checks and commit hooks

Ultracite configures Biome using its core, React, and Next.js presets.

- `npm run fix -- <files>` applies formatting and safe automatic fixes.
- `npm run check -- <files>` checks specific files without modifying them.
- `npm run check` audits the entire project.
- `npm run prepare` reinstalls Husky if Git hooks need repairing. Normal `npm install`
  and `npm ci` run this automatically.

Before each commit, Husky runs lint-staged against staged JavaScript, TypeScript,
JSON, and CSS files. Ultracite safely formats/fixes those files; remaining lint or
syntax errors block the commit. Then the project's full TypeScript check runs.
Files with unstaged edits are handled by lint-staged's normal backup/restore flow.
Do not use hook-bypass flags to get around failures.

Generated Drizzle snapshots, the generated PDF viewer, Next's generated declaration
file, the package lock, build output, ignored local files, and coverage output are
excluded from source linting. Markdown and SVG are not sent to Biome. Existing
application rules are not disabled. VS Code's project settings use the Biome
extension for supported source files, with format and safe fixes on save.

## Full-project gate and scoped exceptions

The original 3,233-finding baseline has been migrated. `npm run check` now checks
the full source tree with no errors or warnings, and CI requires it alongside the
tests, Stripe coverage, TypeScript, and the production build.

The presets remain globally enabled. Source-local comments document deliberate
exceptions rather than changing observable behavior merely to satisfy a heuristic:

- Controlled DOM/React Aria callbacks capture current form/row values; these are
  not memoized app children that benefit from extra callback memoization.
- Provider pagination, payment/signature state transitions, ordered PDF output,
  and stateful test fixtures await dependent steps sequentially.
- The stylesheet keeps its component/theme cascade order; selectors are not moved
  across responsive boundaries solely to sort specificity.
- Multi-step request and document coordinators retain explicit branches for
  validation, recovery, and rendering. Workflow/PDF regression tests protect output.
- Native confirmations protect unsaved edits and financial/signing actions.
- Static theme bootstrap and escaped/allowlisted notice HTML have explicit trust
  boundaries. Untrusted raw HTML is not allowed elsewhere.
- Drizzle's server-only schema assembly needs the complete schema export object.
- Async test stubs preserve promise/rejection semantics without artificial awaits.

Keep exceptions narrow and explained. A new lint finding should be fixed unless
it represents one of these intentional behaviors; don't copy a suppression as a
substitute for checking the code.

## Versions and verification

Ultracite is pinned to 7.10.2. The newer 7.12.4 dependency graph brought in an
unpatched `braces` advisory (GHSA-vfj7-8cjw-p6xm); 7.10.2 avoids that chain and
passes `npm audit`. Biome, Husky, and lint-staged are also pinned in package.json
and the lockfile. Recheck the audit before updating Ultracite.

Hook verification uses a disposable Git repository: a valid commit is formatted,
syntax and unsafe-eval errors are blocked, TypeScript errors are blocked, and
failed commits do not advance HEAD. No test commits are added to the app's history.

References: [Ultracite with Biome](https://www.ultracite.ai/providers/biome),
[Husky setup](https://typicode.github.io/husky/get-started.html).
