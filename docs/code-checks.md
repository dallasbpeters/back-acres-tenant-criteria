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

## Existing lint baseline

Installing strict rules does not make the existing application compliant. The
initial audit on October 18, 2026 reported **3,233 diagnostics across 146 checked
files**, before any application-wide cleanup. Most are formatting, sorting,
block-statement, inline-callback, non-null assertion, and other style rules; the
report also includes correctness, accessibility, and security findings that need
individual review.

The setup intentionally does not rewrite the application or suppress that debt.
Staged files must pass before committing. The full-project lint command remains
failing until the existing files are migrated. Existing CI continues to require
unit tests, Stripe coverage, TypeScript, and the production build; it does not
claim a clean full-project lint gate yet.

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
