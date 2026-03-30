/** Single queue for all incoming AgentEvents; drained in the frame loop. */
export const eventQueue: Array<{ raw: string; event: unknown }> = [];
