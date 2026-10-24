"""Local-only preview served from the repository root: the tunnel reads the site's plates and depth maps from
apps/web/public and opens the 1822 workshop prototype next to it."""
import argparse
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class PreviewServer(http.server.ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8843)
    args = parser.parse_args()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with PreviewServer(("127.0.0.1", args.port), handler) as server:
        print(f"Chronicle tunnel: http://127.0.0.1:{args.port}/tools/prototypes/chronicle-tunnel/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
