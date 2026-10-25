"""Local-only preview; a larger accept queue supports the scene's parallel module/texture requests."""
import argparse
import functools
import http.server
from pathlib import Path


class PreviewServer(http.server.ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8842)
    args = parser.parse_args()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(Path(__file__).parent))
    with PreviewServer(("127.0.0.1", args.port), handler) as server:
        print(f"1822 workshop: http://127.0.0.1:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
