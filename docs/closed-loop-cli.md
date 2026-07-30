# Closed-loop CLI

The CLI keeps human-readable output by default and emits stable JSON only with
`--json`. It talks to the existing localhost API and uses the configured
`METHEORY_USER_ID` (default `local-user`).

```text
metheory experiment draft-from-hypothesis <candidateId>
metheory experiment draft-list
metheory experiment draft-show <draftId>
metheory experiment draft-edit <draftId> --title=... --statement=...
metheory experiment draft-accept <draftId>
metheory experiment draft-reject <draftId>
metheory experiment list
metheory experiment show <experimentId>
metheory experiment start|pause|resume|complete|cancel|archive <experimentId>
metheory experiment questions <experimentId>
metheory experiment observe <experimentId> --group=<key> --outcome=<number>
metheory experiment evaluate <experimentId>
metheory collection-plan show <planId>
metheory collection-plan accept <planId>
metheory collection-plan request-pcs-template <planId>
metheory self-model review-due
metheory self-model review <beliefId> --action=<action>
```

The CLI never activates a PCS template or writes a confirmed PCS value. A PCS
request is only a pending generic request returned for user review.