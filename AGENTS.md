## Design Context

### Users
Prospective adult tenants for Back Acres Rental in Amarillo, reviewing tenant selection criteria before applying and recording an individual acknowledgment. The document must work on phones, desktop screens, and paper.

### Brand Personality
Formal, precise, composed. The user explicitly chose a formal document feel over a welcoming marketing presentation. Help applicants feel informed and confident about what they are acknowledging.

### Aesthetic Direction
A carefully typeset property notice: light paper, dark ink, restrained green accents, clear numbered sections, readable serif headings and body text with sans-serif labels and controls. Avoid decorative hero treatments, oversized rent figures, rounded cards, shadows, and promotional language.

### Design Principles
1. Present the property, revision, and purpose as document metadata.
2. Preserve all criteria and acknowledgment wording; distinguish draft content honestly.
3. Make the complete document readable without expanding or hovering.
4. Treat the form as the concluding acknowledgment, with clear labels and accessible feedback.
5. Preserve intrinsic responsive layouts, keyboard focus, reduced motion, and useful printing.

### Typography decision
Voice: formal, precise, composed. Reflex candidates rejected: Newsreader, IBM Plex Serif, and Inter. Physical reference: a carefully typeset property notice, not a sales brochure. Catalog-reviewed selection: Source Serif 4 for the document and Public Sans for metadata and controls. Serve fonts locally through bundled Fontsource assets.

## Code checks

Use Ultracite's Biome presets for core JavaScript/TypeScript, React, and Next.js.
Run `npm run fix -- <files>` to format and safely fix the files you changed,
then `npm run check -- <files>` to verify them. Husky runs lint-staged followed
by the full TypeScript check before committing. Do not bypass the hook.

The existing app has a documented strict-lint baseline in `docs/code-checks.md`;
a whole-project `npm run check` is not currently clean. Keep new or edited files
passing the configured rules, and do not disable rules globally to hide old debt.
