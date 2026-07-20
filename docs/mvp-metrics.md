# MVP Scope And Success Metrics

## MVP Checklist

| Priority | Item | Scope |
|---|---|---|
| Must | Self-belief registration | Capture 3 to 5 initial self-beliefs. |
| Must | Hypothesis templates | Implement the five minimal templates. |
| Must | Prior hypothesis library | Seed 10 to 20 hypotheses. |
| Must | Controlled-random notifications | Send only within user-approved windows. |
| Must | One-question check-ins | Use answer actions optimized for under 10 seconds. |
| Must | AI text structuring | Convert supplemental free text into observation candidates. |
| Must | AI hypothesis generation | Generate up to 3 candidates with strict JSON. |
| Must | Next-question selection | Let AI suggest, but system decides. |
| Must | Safe explanation rendering | Include fallback text. |
| Must | Output validation | Validate every AI output before persistence. |
| Should | Follow-up notifications | Collect outcome after behavior. |
| Should | Weekly review | Show support, contradiction, and insufficient data per hypothesis. |
| Should | Skip analysis | Visualize response patterns and bias. |
| Later | Explicit N-of-1 experiment mode | Add planned single-user experiments. |
| Later | Passive integrations | Calendar, steps, screen time, and similar signals. |

## Minimal Hypothesis Templates

| Template key | Form |
|---|---|
| `state_to_choice` | When state X is high, choice rate for behavior Y changes. |
| `state_to_start` | When state X is high, start rate changes. |
| `state_to_completion` | When state X is high, completion rate changes. |
| `belief_vs_observation` | Self-belief X matches or conflicts with observation Y. |
| `interaction` | The effect of state X changes under condition Z. |

## Seed Hypothesis Library

| Context | Prior hypothesis |
|---|---|
| Night person | Start rate is higher at night. |
| Night person | Completion rate is higher at night. |
| Watches videos when tired | Passive behavior increases when energy is low. |
| Can focus when interested | High interest reduces the effect of fatigue. |
| Chooses easy things when time is short | Short actions increase when free time is short. |
| Slacks off alone | Start rate decreases when alone. |
| Moves with other people | Execution rate increases when accompanied by others. |
| Strong in the morning | Subjective focus is higher in the morning. |
| Avoids new things when mood is low | New-action rate decreases when mood is low. |
| Puts off difficult things | Interruption rate increases with expected difficulty. |
| Progresses with a plan | Planned actions have higher completion. |
| Does not continue when starting impulsively | Unplanned actions have lower completion. |

## Recommended AI Endpoints

| Endpoint | Role | Call timing |
|---|---|---|
| `/ai/structure-checkin` | Structure supplemental free text. | Only when free text is entered. |
| `/ai/generate-hypotheses` | Generate candidate hypotheses. | Only when differences, mismatches, exceptions, or gaps are detected. |
| `/ai/suggest-next-question` | Suggest one question. | Only when scheduler needs a question. |
| `/ai/render-safe-explanation` | Render readable explanation text. | Weekly review and hypothesis detail screens. |

## Success Metrics

| Metric group | Metric | Initial target |
|---|---|---|
| AI quality | Schema valid rate | At least 99% |
| AI quality | Validator first-pass rate | At least 95% |
| AI quality | Numeric inconsistency rate | Under 1% |
| AI quality | Forbidden claim rate | 0% |
| Input UX | Median answer time | Under 10 seconds |
| Input UX | Check-in completion rate | At least 40% |
| Input UX | Post-snooze answer rate | At least 35% |
| Retention | 7-day retention | At least 30% |
| Retention | 28-day retention | At least 15% |
| Analysis value | "Hypothesis was useful" rating | At least 3.8 / 5 |
| Analysis value | Weekly review view rate | At least 50% |
| Data quality | Expired response rate | Under 15% |
| Data quality | One-sided condition insufficiency rate | Under 25% |

