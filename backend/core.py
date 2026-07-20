from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "me_theory_mvp.sqlite3"
RULE_VERSION = "evidence-v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class Store:
    def __init__(self, database_path: Path = DEFAULT_DB):
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.database_path = database_path
        self.connection = sqlite3.connect(database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.executescript((ROOT / "db" / "mvp_schema.sql").read_text(encoding="utf-8"))
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def _one(self, query: str, values: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        row = self.connection.execute(query, values).fetchone()
        return dict(row) if row else None

    def _all(self, query: str, values: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(query, values).fetchall()]

    def create_user(self, auth_subject: str, locale: str, timezone_name: str) -> dict[str, Any]:
        user_id = new_id("usr")
        self.connection.execute(
            "INSERT INTO users(id, auth_subject, locale, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, auth_subject, locale, timezone_name, now_iso()),
        )
        self.connection.commit()
        return self._one("SELECT * FROM users WHERE id = ?", (user_id,))  # type: ignore[return-value]

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        return self._one("SELECT * FROM users WHERE id = ?", (user_id,))

    def create_self_belief(self, user_id: str, statement: str, source_kind: str = "user") -> dict[str, Any]:
        belief_id = new_id("belief")
        self.connection.execute(
            "INSERT INTO self_beliefs(id, user_id, statement, source_kind, created_at) VALUES (?, ?, ?, ?, ?)",
            (belief_id, user_id, statement, source_kind, now_iso()),
        )
        self.connection.commit()
        return self._one("SELECT * FROM self_beliefs WHERE id = ?", (belief_id,))  # type: ignore[return-value]

    def create_hypothesis(self, user_id: str, statement: str, template_key: str, belief_id: str | None) -> dict[str, Any]:
        hypothesis_id = new_id("hyp")
        self.connection.execute(
            """
            INSERT INTO hypotheses(id, user_id, self_belief_id, template_key, statement, status, rule_version, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
            """,
            (hypothesis_id, user_id, belief_id, template_key, statement, RULE_VERSION, now_iso()),
        )
        self.connection.commit()
        return self._one("SELECT * FROM hypotheses WHERE id = ?", (hypothesis_id,))  # type: ignore[return-value]

    def get_hypotheses(self, user_id: str) -> list[dict[str, Any]]:
        return self._all("SELECT * FROM hypotheses WHERE user_id = ? AND status != 'archived' ORDER BY created_at", (user_id,))

    def create_checkin(self, user_id: str, kind: str, hypothesis_id: str | None, question: dict[str, Any]) -> dict[str, Any]:
        checkin_id = new_id("checkin")
        created = now_iso()
        self.connection.execute(
            """
            INSERT INTO checkin_events(id, user_id, hypothesis_id, kind, question_json, scheduled_at, expires_at, scheduler_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (checkin_id, user_id, hypothesis_id, kind, json.dumps(question), created, (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(), RULE_VERSION),
        )
        self.connection.commit()
        result = self._one("SELECT * FROM checkin_events WHERE id = ?", (checkin_id,))
        result["question"] = json.loads(result.pop("question_json"))  # type: ignore[union-attr]
        return result  # type: ignore[return-value]

    def get_checkin(self, checkin_id: str) -> dict[str, Any] | None:
        result = self._one("SELECT * FROM checkin_events WHERE id = ?", (checkin_id,))
        if result:
            result["question"] = json.loads(result.pop("question_json"))
        return result

    def save_response(self, checkin_id: str, response: dict[str, Any]) -> dict[str, Any]:
        existing = self._one("SELECT * FROM responses WHERE idempotency_key = ?", (response["idempotency_key"],))
        if existing:
            return existing
        response_id = new_id("response")
        columns = ("id", "checkin_id", "idempotency_key", "client_created_at", "server_received_at", "payload_json", "missing_reason")
        values = (
            response_id,
            checkin_id,
            response["idempotency_key"],
            response.get("client_created_at", now_iso()),
            now_iso(),
            json.dumps(response, ensure_ascii=False),
            response.get("missing_reason"),
        )
        self.connection.execute(f"INSERT INTO responses({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})", values)
        self.connection.execute("UPDATE checkin_events SET response_status = 'answered' WHERE id = ?", (checkin_id,))
        self.connection.commit()
        return self._one("SELECT * FROM responses WHERE id = ?", (response_id,))  # type: ignore[return-value]

    def insights(self, user_id: str) -> list[dict[str, Any]]:
        hypotheses = self.get_hypotheses(user_id)
        summaries = []
        for hypothesis in hypotheses:
            rows = self._all(
                """
                SELECT r.payload_json, r.missing_reason
                FROM responses r JOIN checkin_events c ON c.id = r.checkin_id
                WHERE c.user_id = ? AND c.hypothesis_id = ?
                """,
                (user_id, hypothesis["id"]),
            )
            supports = challenges = insufficient = 0
            for row in rows:
                payload = json.loads(row["payload_json"])
                if row["missing_reason"] or payload.get("missing_reason"):
                    insufficient += 1
                elif payload.get("outcome") in ("completed", "yes", "supported"):
                    supports += 1
                elif payload.get("outcome") in ("interrupted", "no", "challenged"):
                    challenges += 1
                else:
                    insufficient += 1
            if supports + challenges < 2:
                status = "inconclusive"
            elif supports > challenges:
                status = "supported"
            elif challenges > supports:
                status = "challenged"
            else:
                status = "inconclusive"
            if status != hypothesis["status"]:
                self.connection.execute("UPDATE hypotheses SET status = ? WHERE id = ?", (status, hypothesis["id"]))
            summaries.append({"hypothesis": hypothesis["statement"], "hypothesis_id": hypothesis["id"], "status": status, "supports": supports, "challenges": challenges, "insufficient": insufficient, "sample_size": len(rows), "rule_version": RULE_VERSION})
        self.connection.commit()
        return summaries


class Policy:
    def __init__(self, store: Store):
        self.store = store

    def next_checkin(self, user_id: str, kind: str = "random") -> dict[str, Any]:
        hypotheses = self.store.get_hypotheses(user_id)
        if kind == "hypothesis" and hypotheses:
            hypothesis = min(hypotheses, key=lambda item: item["created_at"])
            question = {"text": "この仮説に関係する行動の結果を教えてください", "type": "single_choice", "field": "outcome", "options": ["completed", "interrupted", "not_applicable"]}
            return self.store.create_checkin(user_id, "hypothesis", hypothesis["id"], question)
        if kind == "follow_up":
            question = {"text": "さきほど始めたことは今どうなっていますか？", "type": "single_choice", "field": "outcome", "options": ["completed", "interrupted", "not_applicable"]}
            return self.store.create_checkin(user_id, "follow_up", None, question)
        question = {"text": "今なにをしていますか？", "type": "single_choice", "field": "activity_type", "options": ["work", "rest", "move", "eat", "other"]}
        return self.store.create_checkin(user_id, "random", None, question)
