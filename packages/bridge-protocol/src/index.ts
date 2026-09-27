export const BRIDGE_PROTOCOL_VERSION = 1 as const;

export type BridgePayload = Record<string, unknown>;

export interface BridgeEnvelope {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION | number;
  type: string;
  requestId: string | null;
  payload: BridgePayload;
}

export function createEnvelope(
  type: string,
  requestId: string | null,
  payload: BridgePayload = {},
): BridgeEnvelope {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    type,
    requestId,
    payload,
  };
}

export function isSupportedEnvelope(envelope: BridgeEnvelope): boolean {
  return envelope.protocolVersion === BRIDGE_PROTOCOL_VERSION && envelope.type.length > 0;
}
