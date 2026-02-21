# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Check everything compiles
cargo check --workspace          # Rust (desktop + mavkit)
npm run frontend:typecheck       # TypeScript

# Run tests
cargo test -p mavkit             # mavkit unit tests
cargo test --workspace           # All Rust tests (excludes SITL)

# Run a single Rust test
cargo test -p mavkit wire_upload_prepends_home

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

Tauri v2 desktop app with three layers: React frontend, Tauri IPC shell, Rust domain crate.

```
React (TypeScript)  ──invoke/listen──>  Tauri Shell (main.rs)  ──calls──>  mavkit
```

### Rust Crate

**`mavkit`** (`crates/mavkit/`) - Async MAVLink SDK:
- `Vehicle` struct - async MAVLink vehicle handle (Clone via Arc, Send + Sync)
- Watch channels for reactive state: `Telemetry`, `VehicleState`, `LinkState`, `MissionState`, `HomePosition`, `TransferProgress`
- Mission operations via `MissionHandle`: upload, download, clear, verify roundtrip, set current
- Flight commands: arm, disarm, set mode, takeoff, guided goto
- Wire boundary: `items_for_wire_upload()` / `plan_from_wire_download()`
- `validate_plan()`, `normalize_for_compare()`, `plans_equivalent()`
- ArduPilot mode tables (feature-gated behind `ardupilot`)

### Wire Boundary Convention

MAVLink wire format puts home at seq 0 for Mission type. The rest of the codebase uses semantic plans where `home` is a separate `Option<HomePosition>` field and items are 0-indexed waypoints. Conversion happens at the wire boundary:
- Upload: `items_for_wire_upload()` prepends home as seq 0, resequences items from seq 1
- Download: `plan_from_wire_download()` extracts seq 0 as home, resequences rest from 0
- Fence/Rally types: no home, items pass through unchanged

### Tauri Shell

`apps/desktop/src-tauri/src/main.rs` - Thin async adapter layer:
- `AppState` holds `tokio::sync::Mutex<Option<Vehicle>>` (single-vehicle)
- `#[tauri::command]` async handlers call `Vehicle` methods directly
- Watch → Tauri event bridge tasks forward state changes to the frontend
- No session IDs — single active connection

### Frontend

- `App.tsx` - Main component with all state management (connection, mission items, home position, transfer)
- `MissionMap.tsx` - MapLibre GL 3D map with terrain, satellite imagery, click-to-add waypoints
- `mission.ts` / `telemetry.ts` - IPC bridge functions (`invoke` + `listen` wrappers)

### IPC Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `link://state` | `LinkState` | Rust -> TS |
| `telemetry://tick` | `Telemetry` | Rust -> TS |
| `vehicle://state` | `VehicleState` | Rust -> TS |
| `home://position` | `HomePosition` | Rust -> TS |
| `mission.progress` | `TransferProgress` | Rust -> TS |
| `mission.state` | `MissionState` | Rust -> TS |

## Key Patterns

- **Serde rename**: All Rust enums use `#[serde(rename_all = "snake_case")]` for TypeScript compatibility. TypeScript types must use matching snake_case string literals.
- **Coordinates**: `MissionItem.x`/`y` are lat/lon as `i32` in degE7 (multiply by 1e7). `HomePosition` uses `f64` degrees.
- **Async commands**: All Tauri commands that need the vehicle are `async fn` using `tokio::sync::Mutex`. Pure commands (validate, list ports) are sync.
- **Watch channels**: Vehicle state is exposed via `tokio::sync::watch` channels. Bridge tasks forward changes to Tauri events. Tasks auto-terminate when Vehicle drops.
- **SITL tests**: Marked `#[ignore]` and run via `--ignored` flag. Must run with `--test-threads=1`. Use `is_optional_type_unsupported()` to skip fence/rally on targets that don't support them. CI runs SITL roundtrip tests on every push and PR.

## Project Status

M0-M2 complete. mavkit SDK complete. Roadmap details in `PLAN.md`.
