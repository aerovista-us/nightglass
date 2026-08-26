import { ShadowBrokerClient } from '../src/engines/shadowbroker/client.mjs';

const client = new ShadowBrokerClient();
try {
  const response = await client.command('osint_tools', {});
  const data = ShadowBrokerClient.unwrap(response);
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const expected = ['dns', 'whois', 'certs', 'ip', 'sanctions', 'github', 'leaks'];
  const missing = expected.filter((tool) => !tools.includes(tool));
  console.log(JSON.stringify({
    ok: true,
    shadowbrokerUrl: client.baseUrl,
    passiveTools: tools,
    expectedToolsPresent: missing.length === 0,
    missing
  }, null, 2));
  if (missing.length) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    shadowbrokerUrl: client.baseUrl,
    error: error?.message || String(error)
  }, null, 2));
  process.exitCode = 1;
}
