SHELL := /usr/bin/env bash

SITL_IMAGE ?= radarku/ardupilot-sitl:eff32c1f98152ac3d1dc09a1e475733b73ce569f
SITL_CONTAINER ?= ardupilot-sitl
SITL_TCP_PORT ?= 5760
SITL_UDP_PORT ?= 14550

MAVPROXY_PID_FILE ?= /tmp/missionplannerng-mavproxy.pid
MAVPROXY_LOG_FILE ?= /tmp/missionplannerng-mavproxy.log

MP_SITL_UDP_BIND ?= 0.0.0.0:$(SITL_UDP_PORT)

.PHONY: help sitl-up sitl-down sitl-logs wait-tcp mavproxy-up mavproxy-down mavproxy-logs wait-udp bridge-up bridge-down status dev-sitl test-sitl test-sitl-strict

help:
	@printf "MissionPlannerNg SITL helper targets\n\n"
	@printf "  make sitl-up            Start ArduPilot SITL docker container\n"
	@printf "  make sitl-down          Stop SITL container\n"
	@printf "  make sitl-logs          Tail SITL container logs\n"
	@printf "  make mavproxy-up        Start MAVProxy bridge via uvx\n"
	@printf "  make mavproxy-down      Stop MAVProxy bridge\n"
	@printf "  make mavproxy-logs      Tail MAVProxy log file\n"
	@printf "  make bridge-up          Start SITL + MAVProxy and wait for UDP\n"
	@printf "  make bridge-down        Stop MAVProxy + SITL\n"
	@printf "  make status             Show SITL and MAVProxy status\n"
	@printf "  make dev-sitl           Start bridge and run tauri desktop app\n"
	@printf "  make test-sitl          Run staged SITL integration tests\n"
	@printf "  make test-sitl-strict   Run strict SITL integration tests\n"

sitl-up:
	docker rm -f "$(SITL_CONTAINER)" >/dev/null 2>&1 || true
	docker pull "$(SITL_IMAGE)"
	docker run -d --rm --name "$(SITL_CONTAINER)" -p "$(SITL_TCP_PORT):5760" \
	  --entrypoint /ardupilot/build/sitl/bin/arducopter "$(SITL_IMAGE)" \
	  --model + --speedup 1 --defaults /ardupilot/Tools/autotest/default_params/copter.parm \
	  --home 42.3898,-71.1476,14.0,270.0 -w

sitl-down:
	docker rm -f "$(SITL_CONTAINER)" >/dev/null 2>&1 || true

sitl-logs:
	docker logs -f "$(SITL_CONTAINER)"

wait-tcp:
	python scripts/sitl_wait_tcp.py --host 127.0.0.1 --port "$(SITL_TCP_PORT)" --timeout 90

mavproxy-up:
	$(MAKE) wait-tcp
	@if [ -f "$(MAVPROXY_PID_FILE)" ] && kill -0 "$$(cat "$(MAVPROXY_PID_FILE)")" 2>/dev/null; then \
	  echo "MAVProxy already running (pid=$$(cat "$(MAVPROXY_PID_FILE)"))"; \
	else \
	  rm -f "$(MAVPROXY_PID_FILE)"; \
	  nohup uvx --from mavproxy --with future --python 3.11 mavproxy.py \
	    --master=tcp:127.0.0.1:$(SITL_TCP_PORT) \
	    --out=udp:127.0.0.1:$(SITL_UDP_PORT) \
	    --daemon --non-interactive \
	    --default-modules=link,signing,log,wp,rally,fence,param,relay,tuneopt,arm,mode,calibration,rc,auxopt,misc,cmdlong,battery,terrain,output,layout \
	    >"$(MAVPROXY_LOG_FILE)" 2>&1 < /dev/null & \
	  echo $$! > "$(MAVPROXY_PID_FILE)"; \
	  echo "MAVProxy started (pid=$$(cat "$(MAVPROXY_PID_FILE)"), log=$(MAVPROXY_LOG_FILE))"; \
	fi

mavproxy-down:
	@if [ -f "$(MAVPROXY_PID_FILE)" ]; then \
	  kill "$$(cat "$(MAVPROXY_PID_FILE)")" >/dev/null 2>&1 || true; \
	  rm -f "$(MAVPROXY_PID_FILE)"; \
	fi
	pkill -f "[m]avproxy.py --master=tcp:127.0.0.1:$(SITL_TCP_PORT)" >/dev/null 2>&1 || true

mavproxy-logs:
	tail -f "$(MAVPROXY_LOG_FILE)"

wait-udp:
	python scripts/sitl_wait_udp.py --host 0.0.0.0 --port "$(SITL_UDP_PORT)" --timeout 120

bridge-up: sitl-up mavproxy-up
	$(MAKE) wait-udp

bridge-down: mavproxy-down sitl-down

status:
	@echo "\n[SITL]"
	@docker ps --filter "name=$(SITL_CONTAINER)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@echo "\n[MAVProxy]"
	@if [ -f "$(MAVPROXY_PID_FILE)" ] && kill -0 "$$(cat "$(MAVPROXY_PID_FILE)")" 2>/dev/null; then \
	  echo "running pid=$$(cat "$(MAVPROXY_PID_FILE)")"; \
	else \
	  echo "not running"; \
	fi

dev-sitl: bridge-up
	npm run tauri:dev

test-sitl:
	MP_SITL_UDP_BIND="$(MP_SITL_UDP_BIND)" cargo test -p mp-telemetry-core --test sitl_roundtrip -- --ignored --nocapture --test-threads=1

test-sitl-strict:
	MP_SITL_UDP_BIND="$(MP_SITL_UDP_BIND)" MP_SITL_STRICT=1 cargo test -p mp-telemetry-core --test sitl_roundtrip -- --ignored --nocapture --test-threads=1
