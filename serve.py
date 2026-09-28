#!/usr/bin/env python3
"""Dev server that never caches.

python3 -m http.server sends Last-Modified and nothing else, so browsers hold on
to modules like lace.js and a reload can leave a fresh page running stale code —
which looks exactly like a change that did not work.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5189
    print(f"serving on http://127.0.0.1:{port}/ (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
