from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from .core import Policy, Store


class Handler(BaseHTTPRequestHandler):
    store = Store()
    policy = Policy(store)

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self) -> None:
        path = [part for part in urlparse(self.path).path.split("/") if part]
        if path == ["healthz"]:
            self._json(200, {"status": "ok", "service": "metheory-mvp"})
            return
        if len(path) == 3 and path[0] == "api" and path[1] == "users" and path[2].endswith("insights"):
            self._json(200, {"items": self.store.insights(path[1])})
            return
        if len(path) == 3 and path[0] == "api" and path[2] == "insights":
            user_id = path[1]
            if not self.store.get_user(user_id):
                self._json(404, {"error": "user_not_found"})
                return
            self._json(200, {"items": self.store.insights(user_id)})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        path = [part for part in urlparse(self.path).path.split("/") if part]
        body = self._body()
        try:
            if path == ["api", "users"]:
                result = self.store.create_user(body.get("auth_subject", "local-user"), body.get("locale", "ja-JP"), body.get("timezone", "Asia/Tokyo"))
                self._json(201, result)
                return
            if len(path) == 4 and path[0:2] == ["api", "users"] and path[3] == "self-beliefs":
                result = self.store.create_self_belief(path[2], body["statement"])
                self._json(201, result)
                return
            if len(path) == 4 and path[0:2] == ["api", "users"] and path[3] == "hypotheses":
                result = self.store.create_hypothesis(path[2], body["statement"], body.get("template_key", "belief_vs_observation"), body.get("self_belief_id"))
                self._json(201, result)
                return
            if len(path) == 4 and path[0:2] == ["api", "users"] and path[3] == "checkins":
                result = self.policy.next_checkin(path[2], body.get("kind", "random"))
                self._json(201, result)
                return
            if len(path) == 4 and path[0:2] == ["api", "checkins"] and path[3] == "responses":
                result = self.store.save_response(path[2], body)
                self._json(201, result)
                return
        except (KeyError, ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": "invalid_request", "detail": str(error)})
            return
        self._json(404, {"error": "not_found"})


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"MeTheory MVP API listening on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        Handler.store.close()


if __name__ == "__main__":
    main()
