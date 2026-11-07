export async function agentRPC(endpoint: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  const res = await fetch('http://127.0.0.1:43187/' + endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.WOW_BRIDGE_TOKEN },
    body: JSON.stringify(data), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35_000)]) : AbortSignal.timeout(35_000),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
