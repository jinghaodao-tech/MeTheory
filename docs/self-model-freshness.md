# Self Model freshness

Self Model items are observations about the user's current records, not
permanent personality facts. self_model_freshness stores the evidence scope,
evidence period, supporting and contradicting counts, linked experiment IDs,
review due date, and one of:

- current
- review_due
- possibly_changed
- unsupported_recently
- retracted

Freshness is computed from stored evidence and dates. New observations only
create a review candidate; they never mutate Self Model automatically. The
user can explicitly review an item as still applicable, context-dependent, not
recently applicable, unknown, retracted, or revised. The review action is
stored in self_model_reviews for history.
