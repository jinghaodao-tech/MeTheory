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
