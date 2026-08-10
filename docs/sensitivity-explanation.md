# Sensitivity explanations

Experiment evaluation includes a deterministic SensitivitySummary. It explains
which changes could alter a conclusion, warns about group imbalance and
excluded or missing observations, and reports the minimum additional
observations needed when a group is short.

Examples include adding enough records to the smaller group, reducing the
observed difference below the configured minimum effect, or changing which
records are eligible. These are conditional explanations of the current
comparison rule. They are not causal inference and do not use an
AI-generated number.


Self-understanding results use the same shared sensitivity model. Binary-rate findings report the smallest number of positive/negative flips in either cohort that would reduce the absolute effect below the configured floor. Numeric-mean findings report not_applicable because a mean cannot be safely changed by a count-only formula; they retain imbalance, missingness, and period warnings.
