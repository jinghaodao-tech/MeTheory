# Notification Policy

## Initial Parameters

- `controlled_random`: 50%
- `hypothesis_driven`: 30%
- `follow_up`: 20%
- `max_per_day`: 3
- `max_per_hour`: 5
- `minimum_interval_minutes`: 90
- `default_channel_importance`: `DEFAULT` or `LOW`

These are product defaults, not research constants. Tune them from opt-in usage metrics and user feedback.

## Flow

```mermaid
flowchart TD
    A[Daily start] --> B[Load user notification permissions and time windows]
    B --> C{Quiet hours or blackout?}
    C -- yes --> Z[Do not send]
    C -- no --> D[Calculate remaining daily budget]
    D --> E{Follow-up due?}
    E -- yes --> F[Add follow-up candidates]
    E -- no --> G[Build hypothesis candidates]
    F --> G
    G --> H[Add controlled-random candidates]
    G --> I[Add hypothesis-driven candidates]
    G --> J[Add follow-up candidates]
    H --> K[Apply sampling weights]
    I --> K
    J --> K
    K --> L{Minimum interval satisfied?}
    L -- no --> Z
    L -- yes --> M[Send DEFAULT or LOW notification]
    M --> N{User response}
    N -- answered --> O[Save check-in]
    N -- snooze --> P[Schedule once after 10 minutes]
    N -- skipped or expired --> Q[Save missed event]
    O --> R{Follow-up condition met?}
    R -- yes --> S[Create follow-up task]
    R -- no --> T[Wait until next candidate window]
    P --> T
    Q --> T
    S --> T
```

## User Controls

- `allowed_time_ranges`
- `quiet_ranges`
- `max_per_day`
- `notification_permission`
- `channel_importance_preference`

The user controls the collection scope and permission. The system chooses the
concrete minute, question, notification kind, cooldown, and budget outcome.
Exact daily notification times are never user-configured. Use `random`,
`hypothesis`, and `follow_up` in storage; product copy may label them
`RANDOM_CHECK_IN`, `HYPOTHESIS_CHECK_IN`, and `FOLLOW_UP_CHECK_IN`.

## UX Rules

- Ask one question per check-in.
- Target answer time under 10 seconds.
- Prefer multiple choice, yes/no, and small numeric fields.
- Use free text only as supplemental MVP input.
- Provide three response actions: answer now, snooze 10 minutes, skip this time.
- Avoid sensitive notification text on lock screens. Use wording such as `1件のチェックインがあります`.
