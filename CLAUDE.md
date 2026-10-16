@AGENTS.md

## Video Generation Rules (promo-video/)
- Workspace: All video code lives strictly inside `/promo-video`.
- Theme Sync: Mirror colors from root `tailwind.config.js` and `src/constants/theme.ts`.
- Data Source: Connect to Supabase via `src/lib/supabase.ts` types if fetching live stats.
- Duration: 15 seconds at 30fps (450 frames total). Format: Vertical 1080x1920.