# Browser Plugin Phase 2 Execution

## Purpose

This document defines the implementation baseline for browser-plugin phase two.

Phase two does not continue the "can the MVP run" question from phase one.
Instead, it turns the browser plugin into a product-ready browser execution endpoint and browser-facing entry point inside the `Immersive-Input` system.

## Phase-2 Goals

Phase two must solve four problems:

1. Move from a mainly local-first shape to a remote-first, cloud-routable product model
2. Keep external AI entry, built-in chat entry, and future desktop collaboration inside one runtime system
3. Turn temporary guide sessions into reusable workflow assets
4. Add enough product surface for delivery, operations, and auditing

## In Scope

- `remote / local` connection modes with `remote` as default
- Cloud gateway, device registration, and session routing
- Unified AI provider layer for external MCP and built-in chat
- Guide template persistence, versioning, replay, and traceability
- Browser-to-desktop handoff and resume with `Immersive-Input`
- Product-ready basics such as login, permissions, audit, and status views

## Out of Scope

- Full desktop automation coverage across every app
- Full enterprise admin or multi-tenant control plane
- Open marketplace for all third-party templates
- Complete billing and commercial subscription system

## Architecture Target

Phase two should adopt a four-layer model:

### 1. Entry Layer

- External AI entry: ChatGPT / Claude / MCP
- Built-in chat entry: popup / sidepanel / companion
- Future desktop entry: `Immersive-Input`

### 2. Cloud Control Layer

- Authentication
- Device registry and online state
- Task routing and session orchestration
- Guide template service
- Audit trail and replay index

### 3. Local Execution Layer

- Browser guide runtime
- Overlay rendering and interaction
- Selector resolution and target location
- Browser-side execution and result reporting

### 4. Cross-Runtime Bridge Layer

- Browser-to-desktop handoff
- Desktop resume
- Shared session IDs, task IDs, and bridge history

## Module Plan

### A. Connection Mode

Suggested additions:

- `app/chrome-extension/common/connection-types.ts`
- `app/chrome-extension/common/connection-mode.ts`
- `app/chrome-extension/entrypoints/background/connection-manager/`
- `app/chrome-extension/entrypoints/popup/components/connection/`
- `app/chrome-extension/entrypoints/sidepanel/components/connection/`

Target capability:

- Persist `remote / local` mode
- Default to `remote`
- Show connection, device, and auth state in UI
- Keep local bridge as an advanced option

### B. Cloud Gateway

Target capability:

- Register browser devices
- Maintain heartbeat and online state
- Route guide sessions to online devices
- Stream execution results and audit events back to the cloud

### C. Unified AI Provider Layer

Target capability:

- Built-in chat can use user API keys or cloud-hosted models
- External MCP and built-in chat share one task payload contract
- Provider metadata remains visible in the session model

### D. Template System

Target capability:

- Save a session as a reusable template
- Create a new session from a template
- Version templates
- Keep replay and execution history

### E. Browser/Desktop Collaboration

Target capability:

- Trigger handoff when the browser cannot complete a step
- Allow desktop resume and state write-back
- Preserve one uninterrupted session timeline

### F. Product Readiness

Target capability:

- Login and device binding
- Connection and execution status pages
- Permission confirmation for sensitive actions
- Error visibility and recovery guidance

## Delivery Stages

### Stage 2.1: Connection Modes and Remote-First Entry

Deliver:

- Connection mode storage
- `ConnectionManager`
- Remote-first popup and sidepanel connection UI
- Welcome screen updated for remote-first onboarding

Accept when:

- New installs default to remote mode
- Users can switch to local mode
- The plugin clearly shows connection state

### Stage 2.2: Cloud Gateway and Device Routing

Deliver:

- Device registration
- Heartbeat and online tracking
- Session routing protocol
- Browser-side remote transport

Accept when:

- Cloud sees online browser devices
- Tasks can be routed to a chosen device
- Browser execution state streams back successfully

### Stage 2.3: Template Persistence and Replay

Deliver:

- Save/load templates
- Template versioning
- Template execution history
- Session-to-template and template-to-session conversion

Accept when:

- Repeated tasks can be launched from templates
- Users can inspect template versions
- Users can inspect execution history

### Stage 2.4: Browser/Desktop Handoff

Deliver:

- Handoff UI
- Bridge state view
- Resume flow
- Browser/desktop executor role markers

Accept when:

- Browser can request handoff
- Desktop can accept and continue
- Session history remains continuous

### Stage 2.5: Product Readiness

Deliver:

- Login and device binding
- Audit and session timeline
- Permission confirmation
- Error recovery UX

Accept when:

- Users can understand who is connected, which device is active, and which runtime is executing
- Sensitive actions are confirmed
- Failures have visible recovery paths

## Acceptance Criteria

Phase two is complete only when:

### Functional

- External AI and built-in chat both create tasks through the same runtime
- Remote mode is the default and local mode remains available
- Templates can be saved, reused, versioned, and replayed
- Browser and desktop can hand off and resume work

### Engineering

- New contracts remain in the shared layer
- Cloud control plane and local execution plane stay clearly separated
- The browser execution layer is not coupled to one single model provider
- Compile/build and key flow verification remain stable

### Product

- Users can see where the plugin is connected, who started the task, and which step is running
- Users can switch modes and inspect state
- Audit and traceability are available for delivered flows

## Risks and Gatekeeping

### Risk 1: Cloud and local responsibilities drift together

Gate:

- Cloud stays as the control plane
- Browser plugin keeps local execution authority
- Do not move browser action execution into the cloud

### Risk 2: Template scope expands too early

Gate:

- Focus on high-frequency tasks first
- Do not build an open marketplace in phase two
- Start with save, version, replay, and traceability

### Risk 3: Browser/Desktop bridge becomes too coupled

Gate:

- All cross-runtime state flows through shared contracts
- Browser code must not hardcode desktop-specific behavior
- Keep handoff and resume protocol-driven

### Risk 4: UI spreads out again

Gate:

- All entry points must converge into guide runtime
- Popup, sidepanel, and welcome surfaces remain entry/status shells
- Do not let each UI surface build its own task orchestration path
