from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.core import Policy, Store


class MvpCoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp_dir.name) / "test.sqlite3")
        self.policy = Policy(self.store)
        self.user = self.store.create_user("test-user", "ja-JP", "Asia/Tokyo")

    def tearDown(self) -> None:
        self.store.close()
        self.temp_dir.cleanup()

    def test_hypothesis_response_updates_deterministic_insight(self) -> None:
        belief = self.store.create_self_belief(self.user["id"], "自分は始めるのが苦手")
        hypothesis = self.store.create_hypothesis(self.user["id"], "開始を宣言すると完了しやすい", "state_to_start", belief["id"])
        first = self.policy.next_checkin(self.user["id"], "hypothesis")
        self.store.save_response(first["id"], {"idempotency_key": "one", "outcome": "completed"})
        second = self.policy.next_checkin(self.user["id"], "hypothesis")
        self.store.save_response(second["id"], {"idempotency_key": "two", "outcome": "interrupted"})
        summary = self.store.insights(self.user["id"])[0]
        self.assertEqual(summary["hypothesis_id"], hypothesis["id"])
        self.assertEqual(summary["status"], "inconclusive")
        self.assertEqual(summary["supports"], 1)
        self.assertEqual(summary["challenges"], 1)

    def test_response_idempotency_does_not_duplicate(self) -> None:
        checkin = self.policy.next_checkin(self.user["id"], "random")
        first = self.store.save_response(checkin["id"], {"idempotency_key": "same", "activity_type": "work"})
        second = self.store.save_response(checkin["id"], {"idempotency_key": "same", "activity_type": "work"})
        self.assertEqual(first["id"], second["id"])


if __name__ == "__main__":
    unittest.main()
