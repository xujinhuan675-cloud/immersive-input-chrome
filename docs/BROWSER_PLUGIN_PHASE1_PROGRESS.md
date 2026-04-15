# Browser Plugin Phase 1 Progress

## Current Snapshot

Status: Closed Out (Engineering)
Owner: Local workspace
Goal: Browser immersive guide MVP is closed out and ready for phase-two expansion

## Progress Board

### 1. Shared Protocol

- [x] Add shared guide schema
- [x] Export shared guide schema from package entry
- [x] Re-export guide types inside extension common layer
- Carry into phase 2: session version migration policy

### 2. Browser Runtime

- [x] Add background guide runtime listener
- [x] Add guide session persistence
- [x] Add create/list/get/start/advance/cancel/attach-tab actions
- [x] Add runtime event broadcasting for UI consumers
- Carry into phase 2: richer error classification

### 3. Browser Overlay

- [x] Add guide overlay content script
- [x] Add selector-based highlight rendering
- [x] Add runtime panel rendering
- [x] Add next / skip / cancel interaction controls
- [x] Add resilient reflow / resize tracking

### 4. Entry Unification

- [x] Connect built-in chat to guide runtime
- [x] Connect external MCP-triggered tasks to guide runtime
- [x] Add local popup preview entry into guide runtime
- [x] Unify task payload format between both paths

### 5. Immersive-Input Readiness

- [x] Reserve integration hints in shared session schema
- [x] Define browser-to-desktop bridge event contract
- [x] Define handoff / resume lifecycle

## Phase-1 Closeout Summary

- Guide runtime, guide session persistence, overlay MVP, popup preview, built-in chat entry, external MCP entry, and bridge readiness are all landed.
- The browser plugin surface has been narrowed into a guide-runtime-driven capability pool while mature background capabilities remain reusable.
- Historical type debt in `tests/record-replay-v3` and `tests/web-editor-v2` has been cleaned up.
- `pnpm --filter chrome-mcp-server compile` and `pnpm --filter chrome-mcp-server build` both pass.
- Further expansion now moves to phase 2 instead of adding more scope to phase 1.

## Current Gate Status

### Protocol Gate

- [x] Shared schema exists
- [x] Shared export exists
- [x] Browser common re-export exists

### Runtime Gate

- [x] Session create works at code level
- [x] Session storage exists
- [x] Runtime transition handlers exist
- [x] Overlay dispatch exists
- [x] Session change events can be broadcast to UI consumers

### UI Gate

- [x] Overlay can render
- [x] Overlay can highlight selector target
- [x] Overlay can hide
- [x] Overlay supports next / skip / end controls

### Entry Gate

- [x] External AI entry is wired to guide runtime
- [x] Built-in chat entry is wired to guide runtime
- [x] Local popup preview can create and start a guide session
- [x] Shared task adapter exists

### Reuse Gate

- [x] Session contract includes source/target/integration metadata
- [x] Shared bridge event contract exists
- [x] Immersive-Input bridge adapter exists
- [x] Resume / replay policy exists

## Change Log

### Initial Landing

- Added shared guide schema
- Added browser guide runtime storage and listeners
- Added content guide overlay MVP
- Added phase-one execution and progress documents

### Preview Slice

- Added local popup entry for immersive guide preview
- Added overlay controls for next / skip / end
- Added runtime session-changed broadcast event
- Added shared browser-to-desktop bridge event types

### External MCP Slice

- Exported direct guide runtime operations for reuse outside the UI message layer
- Added an external MCP immersive-guide tool for create/get/list/start/next/skip/cancel/attach-tab
- Wired MCP-triggered guide sessions to the same runtime used by popup preview and built-in chat

### Bridge Adapter Slice

- Added a persistent browser-to-Immersive-Input bridge adapter with local event history
- Added handoff / accept / resume lifecycle actions in the guide runtime
- Added MCP guide actions for bridge_state / bridge_events / request_handoff / accept_handoff / resume

### Shared Task Adapter Slice

- Added a shared guide task payload adapter used by popup / chat launch flow and MCP guide creation
- Removed duplicate session-create payload assembly across internal and external entry points

## Closeout Verification

1. A local entry point in the extension can create a guide session without manual message crafting.
2. The created session can be previewed in the browser with visual overlay and target highlighting.
3. Advancing the session updates the overlay correctly.
4. The session structure remains compatible with future desktop handoff.
5. The extension codebase now meets compile-pass and build-pass handoff requirements.

## Phase-2 Carryover

- Session version migration policy
- Richer runtime error classification and recovery
- Remote connection mode and cloud MCP routing
- Template reuse, traceability, and browser-to-desktop collaboration
