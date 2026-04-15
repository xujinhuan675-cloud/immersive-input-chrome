# Browser Plugin Phase 1 Execution

## Purpose

This document is the local execution baseline for phase-one browser plugin work.
It exists for three goals:

1. Full local preview of current progress
2. Delivery gatekeeping before each phase is marked complete
3. Future traceability and reuse when browser and desktop runtimes converge into Immersive-Input

## Phase 1 Scope

Phase one focuses on the browser plugin only.

The target outcome is:

- The extension can accept tasks from external AI entry points through MCP
- The extension can also accept tasks from its own built-in chat entry point
- Both entry paths are routed into the same guide session runtime
- The browser can render a first immersive guide overlay with step state and element highlight
- The protocol is prepared for future Immersive-Input desktop handoff

## Existing Baseline

Current project assets already available:

- `mcp-chrome` browser execution foundation
- `AgentChat` sidepanel entry
- `popup` quick tool entry
- `element-marker` selector and anchor management
- `web-editor` overlay-related infrastructure
- `record-replay-v3` step/runtime ideas that can be reused

## Phase 1 Deliverables

### D1. Shared Protocol

- Shared guide session schema
- Shared guide step schema
- Shared entry source / permission / status model
- Shared bridge-friendly structure for future desktop integration

### D2. Browser Runtime

- Background guide runtime listener
- Guide session create/list/get/start/advance/cancel flow
- Session persistence in extension storage
- Overlay dispatch bridge from background to content script

### D3. Overlay MVP

- Browser content script for guide overlay
- Current step panel
- Target selector highlight
- Runtime status display

### D4. Entry Unification

- External AI path mapped into guide runtime
- Built-in chat path mapped into guide runtime
- Local popup preview path mapped into guide runtime
- Shared task contract between both paths

### D5. Immersive-Input Readiness

- Session schema leaves room for desktop handoff
- Runtime events can be reused by desktop bridge later
- Shared bridge event contract exists for browser-to-desktop convergence
- Persistent local bridge event history exists for traceability and later replay
- Handoff / accept / resume lifecycle exists at runtime level
- No browser-only assumptions hardcoded into the session contract

## Delivery Gates

Phase one cannot be marked complete until all gates below are true.

### Gate A. Protocol Gate

- Shared guide types are exported from the shared package
- Browser extension imports guide types from a shared source instead of duplicating them
- Session structure includes source, target, permission mode, status, steps, metadata, and integration hints

### Gate B. Runtime Gate

- Background script can create and persist guide sessions
- Guide session state can be queried locally
- Runtime can start, advance, cancel, and attach a tab
- Runtime can drive overlay updates

### Gate C. UI Gate

- Content script overlay can show current session status
- Content script overlay can highlight a target element by selector
- Overlay can hide cleanly when session ends

### Gate D. Entry Gate

- At least one external path can create a guide session
- At least one internal path can create a guide session
- Both paths converge into the same guide runtime

### Gate E. Reuse Gate

- Session contract is not tied to one single provider
- Session contract supports future `Immersive-Input` bridge hints
- Browser-only state is kept out of cross-runtime domain definitions when possible

## Module Ownership

### Shared Layer

- `packages/shared/src/guide-types.ts`
- Domain schema and cross-runtime contract

### Browser Runtime Layer

- `app/chrome-extension/entrypoints/background/guide-runtime/`
- Session store, runtime transitions, overlay dispatch

### Browser UI Layer

- `app/chrome-extension/entrypoints/guide-overlay.content.ts`
- `app/chrome-extension/shared/guide-overlay/`

### Future Integration Layer

- Built-in chat provider abstraction
- MCP task adapter
- Immersive-Input bridge adapter
- Bridge event history and handoff state store

## Next Implementation Slices

### Slice 1

- Shared guide schema
- Message contracts
- Background guide runtime
- Content overlay MVP

### Slice 2

- Built-in chat to guide-session adapter
- Popup or sidepanel entry for local guide preview
- Guide session debug view

### Slice 3

- External MCP tool mapped into guide runtime
- Marker-to-guide-anchor reuse
- Browser session timeline and audit trail

### Slice 4

- Immersive-Input bridge adapter
- Desktop handoff metadata and session continuation
- Cross-runtime session replay

## Current Phase-1 Closeout Order

1. [Done] External MCP entry converges into the same guide runtime
2. [Done] Browser plugin and future `Immersive-Input` share a real bridge adapter
3. [Done] Shared task payload format is unified across internal and external entry points
4. [Done] Historical test/type debt is cleaned enough for phase-one handoff

## Phase-1 Closeout Result

- Phase-one scope is complete: unified entry paths, unified guide runtime, overlay MVP, and bridge readiness are all delivered.
- The current codebase passes `pnpm --filter chrome-mcp-server compile` and `pnpm --filter chrome-mcp-server build`.
- Phase one is now treated as a closed engineering handoff baseline rather than an active feature branch.
- Session migration strategy, richer error handling, and cloud-facing capabilities move into phase two.

## Phase-2 Hand-off

- Phase-two implementation planning lives in [浏览器插件二期实施方案.md](/F:/IOTO-Doc/immersive-input-chrome/docs/浏览器插件二期实施方案.md)
