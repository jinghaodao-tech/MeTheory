export type AiClientType = 'custom_gpt' | 'mcp' | 'openai_api' | 'other';
export type AiReadContext = { userId: string; clientId: string; clientType: AiClientType; purpose: string; scopes: string[] };
export type AiAggregateQuery = AiReadContext & { parameterIds: string[]; startAt: string; endAt: string; groupBy?: 'day' | 'time_period' };
export type AiAggregateResponse = { accessLevel: 'aggregate_only'; groups: Array<{ parameterId: string; sampleCount: number; missingCount: number; mean: number | null; minimum: number | null; maximum: number | null }>; deniedParameterIds: string[] };
export type McpToolName = 'list_parameters' | 'get_parameter_definition' | 'get_self_model' | 'list_hypotheses' | 'get_hypothesis' | 'get_hypothesis_evidence' | 'get_missing_parameters' | 'query_parameter_aggregates' | 'get_ai_snapshot';
