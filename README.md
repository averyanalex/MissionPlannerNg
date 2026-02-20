# MissionPlannerNg

Modern Mission Planner rewrite using Tauri + React + Rust.

Current state: M0/M1 complete, M2 in progress (3D MapLibre planner, mission transfer engine, mission state events, staged SITL roundtrip automation).

## Stack

- Desktop: Tauri v2
- Frontend: React + TypeScript + Vite
- Core: Rust (`mp-telemetry-core`, `mp-mission-core`)
- Map: MapLibre GL JS (3D terrain + satellite hybrid)

## Prerequisites

- Node.js 20+
- Rust stable toolchain
- npm
- Optional but recommended: Nix (`nix develop`) for a preconfigured shell

## Local development

Install dependencies:

```bash
npm install
```

Common commands:

```bash
npm run frontend:typecheck
npm run frontend:build
cargo check --workspace
cargo test --workspace
npm run tauri:dev
```

## Use Mission Planner with ArduPilot SITL (development)

This is the dev loop used by CI and local SITL testing.

### Quick path with Makefile

```bash
make bridge-up
make status
make dev-sitl
```

Run staged integration tests:

```bash
make test-sitl
```

Run strict integration tests (fails on mission timeout/unsupported behavior):

```bash
make test-sitl-strict
```

Stop everything:

```bash
make bridge-down
```

`make dev-sitl` starts SITL + MAVProxy bridge, waits for UDP telemetry, then launches `npm run tauri:dev`.
Wait logic uses checked-in Python helpers: `scripts/sitl_wait_tcp.py` and `scripts/sitl_wait_udp.py`.

You can also inspect logs with:

```bash
make sitl-logs
make mavproxy-logs
```

### 1) Start SITL container

```bash
docker pull radarku/ardupilot-sitl
docker run -d --rm --name ardupilot-sitl -p 5760:5760 radarku/ardupilot-sitl
```

### 2) Bridge SITL TCP -> UDP using MAVProxy (with `uvx`)

```bash
uvx --from mavproxy --with future --python 3.11 mavproxy.py \
  --master=tcp:127.0.0.1:5760 \
  --out=udp:127.0.0.1:14550 \
  --daemon --non-interactive \
  --default-modules=link,signing,log,wp,rally,fence,param,relay,tuneopt,arm,mode,calibration,rc,auxopt,misc,cmdlong,battery,terrain,output,layout
```

This uses SITL TCP `5760` (same baseline transport used by legacy Mission Planner SITL tooling) and forwards MAVLink to UDP `14550` for this app.

### 3) Launch the desktop app

```bash
npm run tauri:dev
```

In the app:

- Select UDP connection
- Bind address: `0.0.0.0:14550`
- Connect

You should then see telemetry and mission workflows available (Read/Write/Verify/Clear, Set Current).

### 4) (Optional) Run SITL roundtrip integration tests

```bash
MP_SITL_UDP_BIND=0.0.0.0:14550 cargo test -p mp-telemetry-core --test sitl_roundtrip -- --ignored --nocapture --test-threads=1
```

### 5) Cleanup

```bash
docker rm -f ardupilot-sitl
```

## CI

- `.github/workflows/ci.yml`: frontend + rust checks/tests (with rust cache and Linux system deps)
- `.github/workflows/sitl-mission.yml`: staged SITL mission roundtrip workflow (manual/nightly)

## Planning

Project roadmap and current milestone tracking live in `PLAN.md`.
