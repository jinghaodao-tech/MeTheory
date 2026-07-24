import type { McpToolName } from './ai.ts';

export type McpReadRequest = { tool: McpToolName; userId: string; clientId: string; purpose: string; arguments: Record<string, unknown> };
export type McpReadHandler = (request: McpReadRequest) => Promise<unknown>;
export const MCP_READ_ONLY_TOOLS: readonly McpToolName[] = ['list_parameters', 'get_parameter_definition', 'get_self_model', 'list_hypotheses', 'get_hypothesis', 'get_hypothesis_evidence', 'get_missing_parameters', 'query_parameter_aggregates', 'get_ai_snapshot'];
export function createMcpReadOnlyAdapter(handler: McpReadHandler) { return { async call(request: McpReadRequest) { if (!MCP_READ_ONLY_TOOLS.includes(request.tool)) throw new Error('mcp_tool_not_allowed'); if (!request.userId || !request.clientId || !request.purpose) throw new Error('mcp_context_required'); return handler(request); } }; }
