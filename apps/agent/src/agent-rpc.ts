import {
  rpcRequests,
  rpcResponses,
  type RpcEndpoint,
  type RpcInput,
  type RpcOutput,
} from '@wisp/protocol/agent-rpc';
export function bridgeOrigin() {
  return new URL(process.env.WOW_BRIDGE_URL || 'http://127.0.0.1:43187').origin;
}
export async function agentRPC<K extends RpcEndpoint>(
  endpoint: K,
  data: RpcInput<K>,
  signal?: AbortSignal,
  timeoutMs = 35_000,
): Promise<RpcOutput<K>> {
  const res = await fetch(bridgeOrigin() + '/' + endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN,
    },
    body: JSON.stringify(rpcRequests[endpoint].parse(data)),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return rpcResponses[endpoint].parse(await res.json()) as RpcOutput<K>;
}
