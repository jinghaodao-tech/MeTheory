# PCS 15-minute demo

1. Run `npm run dev:api` and `npm run demo` in separate terminals.
2. Open `http://127.0.0.1:8200`, bind a local user to a PCS profile, then run the fixture analysis.
3. Copy the returned run ID into Candidate Review and save `fits`, `does_not_fit`, or `on_hold`.
4. Create a draft, explicitly accept it, start it, and record one A and one B observation.
5. Complete and evaluate the experiment. The deterministic result shows counts, missingness, balance, and effect difference.
6. Enter a user-written Self Model statement and create a proposal. It is only a proposal.
7. Review that proposal through the Self Understanding approval endpoint to accept or reject it; only acceptance writes a Self Belief.

For Live PCS, configure `PCS_API_URL`, `PCS_CLIENT_ID`, and `PCS_CLIENT_TOKEN` with a loopback URL. Fixture analysis never silently falls back when Live PCS fails.
