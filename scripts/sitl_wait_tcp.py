#!/usr/bin/env python3

import argparse
import socket
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(description="Wait for SITL TCP endpoint")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5760)
    parser.add_argument("--timeout", type=float, default=90.0)
    args = parser.parse_args()

    deadline = time.time() + args.timeout
    while time.time() < deadline:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        try:
            sock.connect((args.host, args.port))
            print(f"SITL TCP endpoint reachable at {args.host}:{args.port}")
            return 0
        except OSError:
            time.sleep(1)
        finally:
            sock.close()

    print(f"Timed out waiting for SITL TCP endpoint at {args.host}:{args.port}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
