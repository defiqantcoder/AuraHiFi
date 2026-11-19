---
name: scaffold-audio-feature
description: "Plan, scaffold, implement, and test a vertical audio or UI feature across the Rust Tauri v2 backend and React frontend."
---

# Skill: Scaffold Audio Feature

## Steps

1. Read `@PLAN.md` and `@DESIGN.md` to confirm existing IPC contracts, SQLite tables, and visual tokens.
2. Draft a concise implementation plan listing:
   - Rust structs, modules, and `#[tauri::command]` signatures to add/modify.
   - TypeScript interface updates in `src/lib/audioBridge.ts` (updating both `MockAudioBridge` and `TauriAudioBridge`).
   - React components and state changes.
   - Real-time thread safety and bit-perfect impact assessment.
3. Pause for user approval before editing code.
4. Implement the Rust backend first and verify compilation with `cargo check --manifest-path src-tauri/Cargo.toml`.
5. Update `src/lib/audioBridge.ts` and the React UI components, then verify with `npm run typecheck && npm run build`.
6. Write unit tests (running `cargo test --release --manifest-path src-tauri/Cargo.toml`) and summarize verified checks plus any remaining manual hardware tests.
