# Mandela project instructions

## Documentation maintenance

For every feature implementation, bug fix, refactor, or configuration change:

1. Inspect the current source, Firestore rules, configuration, and relevant tests before documenting behavior.
2. Update the relevant documentation in the same change. Keep the root `README.md` as the entry point; project guides live in `docs/`. Maintain `docs/IMPLEMENTATION.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, and `docs/IMPLEMENTATION-STATUS.md` when the change affects their subjects. Use `docs/IMPLEMENTATION-STATUS.md` as the single canonical progress/checklist document.
3. Update existing documentation instead of creating duplicate guides. Preserve useful context and keep claims consistent across documents.
4. Record exact files/functions and only the tests or validation commands actually run, including failures and blockers.
5. Distinguish implemented, partial, pending, and deployed behavior. Never claim security validation, successful deployment, or live behavior without evidence.
6. Review the documentation diff alongside the code diff before finishing.

## Project-specific cautions

- Firestore authorization is defined in `firestore.rules`; UI visibility and selected-business state are not security boundaries.
- Firestore rules deployment is separate from frontend build and Hosting deployment. Do not deploy without an explicit request and confirmed Firebase project.
- Keep Dev (`mandelagenerals-dev`) and Production (`mandelageneralshop`) distinct.
- Do not infer branch assignments or migrate existing tenant records without an explicit migration design.
- Consult the project guides linked from `README.md` instead of duplicating their full content here.

## Validation

- `npm run build` runs the TypeScript no-emit check followed by the production Vite build.
- `git diff --check` checks patch whitespace.
- The repository currently has no configured automated test script; do not imply a full test suite ran.
