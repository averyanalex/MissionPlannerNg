# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Check everything compiles
cargo check --workspace          # Rust (all 3 crates)
npm run frontend:typecheck       # TypeScript

# Run tests
cargo test -p mp-mission-core    # Mission domain unit tests
cargo test -p mp-telemetry-core  # Telemetry/link unit tests
cargo test --workspace           # All Rust tests (excludes SITL)

# Run a single Rust test
cargo test -p mp-mission-core wire_upload_prepends_home

# SITL integration tests (requires running SITL bridge)
make bridge-up                   # Start ArduPilot SITL + MAVProxy
make test-sitl                   # Run SITL roundtrip tests
make test-sitl-strict            # Strict mode (MP_SITL_STRICT=1)
make bridge-down                 # Stop everything

# Dev
npm run tauri:dev                # Launch desktop app with hot reload
make dev-sitl                    # Start bridge + launch app
```

All commands run from the repo root. Root `package.json` proxies npm scripts to `apps/desktop` via workspaces.

## Architecture

Tauri v2 desktop app with three layers: React frontend, Tauri IPC shell, Rust domain crates.

```
React (TypeScript)  ──invoke/listen──>  Tauri Shell (main.rs)  ──calls──>  Rust Crates
```

### Rust Crates

**`mp-mission-core`** (`crates/mp-mission-core/`) - Pure domain logic, no I/O:
- `MissionPlan`, `MissionItem`, `HomePosition` types
- `MissionTransferMachine` - upload/download state machine with retry policy
- `validate_plan()`, `normalize_for_compare()`, `plans_equivalent()`
- Wire boundary: `items_for_wire_upload()` / `plan_from_wire_download()`

**`mp-telemetry-core`** (`crates/mp-telemetry-core/`) - MAVLink I/O and session management:
- `LinkManager` - multi-session lifecycle (UDP/serial connections)
- `CoreEvent` enum - all events emitted to the frontend (telemetry, link state, mission progress, home position)
- Mission operations: upload, download, clear, verify roundtrip, set current
- HOME_POSITION MAVLink message handling

### Wire Boundary Convention

MAVLink wire format puts home at seq 0 for Mission type. The rest of the codebase uses semantic plans where `home` is a separate `Option<HomePosition>` field and items are 0-indexed waypoints. Conversion happens at the wire boundary:
- Upload: `items_for_wire_upload()` prepends home as seq 0, resequences items from seq 1
- Download: `plan_from_wire_download()` extracts seq 0 as home, resequences rest from 0
- Fence/Rally types: no home, items pass through unchanged

### Tauri Shell

`apps/desktop/src-tauri/src/main.rs` - Thin adapter layer:
- `AppState` holds `Mutex<LinkManager>` + event channel
- `#[tauri::command]` handlers forward to `LinkManager` methods
- Background thread dispatches `CoreEvent` variants to Tauri event bus

### Frontend

- `App.tsx` - Main component with all state management (connection, mission items, home position, transfer)
- `MissionMap.tsx` - MapLibre GL 3D map with terrain, satellite imagery, click-to-add waypoints
- `mission.ts` / `telemetry.ts` - IPC bridge functions (`invoke` + `listen` wrappers)

### IPC Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `link://state` | `LinkStateEvent` | Rust -> TS |
| `telemetry://tick` | `TelemetryEvent` | Rust -> TS |
| `home://position` | `HomePositionEvent` | Rust -> TS |
| `mission.progress` | `TransferProgress` | Rust -> TS |
| `mission.error` | `TransferError` | Rust -> TS |
| `mission.state` | `MissionStateEvent` | Rust -> TS |

## Key Patterns

- **Serde rename**: All Rust enums use `#[serde(rename_all = "snake_case")]` for TypeScript compatibility. TypeScript types must use matching snake_case string literals.
- **Coordinates**: `MissionItem.x`/`y` are lat/lon as `i32` in degE7 (multiply by 1e7). `HomePosition` uses `f64` degrees.
- **Transfer state machine**: `MissionTransferMachine` in `transfer.rs` is a pure state machine (no I/O). The telemetry crate drives it by feeding MAVLink messages and extracting outbound messages.
- **SITL tests**: Marked `#[ignore]` and run via `--ignored` flag. Must run with `--test-threads=1`. Use `is_optional_type_unsupported()` to skip fence/rally on targets that don't support them.

## Project Status

M0/M1 complete, M2 (mission planning MVP) active. Roadmap details in `PLAN.md`.
