# Experiment domain model

ExperimentDraft is an editable proposal derived from a candidate. It keeps the
source candidate, comparison groups, expected direction, target outcome,
required parameters, duration, burden notes, and stop conditions.

Experiment has the guarded lifecycle:

draft -> ready -> active -> paused -> active -> completed -> evaluated -> archived

cancelled, insufficient_data, and invalid are recovery or terminal states.
State changes are validated by transitionExperiment; route handlers do not
assign arbitrary states.

ExperimentObservation contains an ID, timestamp, group key, numeric outcome,
source, eligibility, optional condition values, and an optional observation
episode. It contains no Markdown body.

ExperimentEvaluation contains the period, group counts, effect summary,
supporting and contradicting observation IDs, data-quality warnings, adherence,
alternative explanations, sensitivity summary, and next options. It describes
the observed data and does not assert causation.

DataCollectionPlan converts shortages into askable questions and may include a
pending generic PCS template request. A request is not sent or activated by
MeTheory without a separate user action.
