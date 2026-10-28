# BeatOrbit workspace instructions

Read and follow .agents/rules/anti-loop.md for all work in this workspace.

- Preserve user changes and keep application changes scoped.
- Authentication via Supabase Auth is mandatory (dedicated Login and Sign Up pages); user data is isolated per account via PostgreSQL Row-Level Security (RLS) and Supabase Storage (`user-audio`) with local IndexedDB audio caching.
- Standard Play and Studio Playtest must share the same timing, input, and scoring engine.
- Run npm test and npm run build after relevant application changes.
- Report device/browser checks that could not be verified.
