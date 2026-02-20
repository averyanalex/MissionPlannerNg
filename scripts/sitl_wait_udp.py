#!/usr/bin/env python3

import argparse
import socket
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(description="Wait for SITL UDP telemetry payload")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=14550)
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((args.host, args.port))
    sock.settimeout(1)

    deadline = time.time() + args.timeout
    while time.time() < deadline:
        try:
            data, _ = sock.recvfrom(4096)
            if data:
                print(f"Received UDP telemetry payload on {args.host}:{args.port}")
                return 0
        except TimeoutError:
            pass

    print(f"Timed out waiting for UDP telemetry payload on {args.host}:{args.port}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
