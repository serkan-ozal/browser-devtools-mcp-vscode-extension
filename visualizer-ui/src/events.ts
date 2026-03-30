/** Minimal AgentEvent shape from MCP server (runId, agentId, ts, type). */
export type AgentEvent = {
  runId: string;
  agentId: string;
  ts: number;
  type: string;
  [key: string]: unknown;
};
