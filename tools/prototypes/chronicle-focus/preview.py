"""Local-only preview of the focused chronicle layout. Serves this directory, the site's media
(apps/web/public/media, so plates and fonts keep their site paths), the 1822 workshop prototype at
/difference-engine-1822/, and forwards the one data request, /api/site/chronicle, to a running API
(npm run dev:api; default http://127.0.0.1:3001)."""
import argparse
import functools
import http.server
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parents[2] / "apps" / "web" / "public"
WORKSHOP = HERE.parent / "difference-engine-1822"


class Handler(http.server.SimpleHTTPRequestHandler):
    api = "http://127.0.0.1:3001"

    def do_GET(self):
        if self.path.split("?")[0] == "/api/site/chronicle":
            # The live site's Cloudflare rejects Python's default User-Agent.
            request = urllib.request.Request(self.api + "/api/site/chronicle", headers={"User-Agent": "e-acc-chronicle-focus-preview"})
            with urllib.request.urlopen(request, timeout=10) as upstream:
                body = upstream.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # A prototype under edit: never let the browser keep an old module.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        if path.startswith("/media/"):
            return str(MEDIA / path.split("?")[0].lstrip("/"))
        if path.startswith("/difference-engine-1822/"):
            return str(WORKSHOP / path.split("?")[0].removeprefix("/difference-engine-1822/"))
        return super().translate_path(path)


class PreviewServer(http.server.ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8844)
    parser.add_argument("--api", default="http://127.0.0.1:3001")
    args = parser.parse_args()
    Handler.api = args.api.rstrip("/")
    with PreviewServer(("127.0.0.1", args.port), functools.partial(Handler, directory=str(HERE))) as server:
        print(f"Chronicle focus: http://127.0.0.1:{args.port}/?t=1822", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
