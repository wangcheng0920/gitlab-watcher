const { createSdkPocServer } = require('../src/mcp/sdk-poc');

const DEFAULT_PROTOCOL_VERSION = '2025-11-05';

async function runManualMcpSdkCheck({
  logger = console,
  host = '127.0.0.1',
  port = 0,
  transportMode = 'stateful',
  hijackReply = true,
  enableJsonResponse = true,
} = {}) {
  const app = await createSdkPocServer({
    logger: false,
    transportMode,
    hijackReply,
    enableJsonResponse,
  });

  await app.listen({ host, port });

  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${actualPort}`;

  logger.info(
    `Starting MCP SDK manual check: transportMode=${transportMode}, hijackReply=${hijackReply}, enableJsonResponse=${enableJsonResponse}`,
  );

  try {
    const initializeResponse = await postJson(`${baseUrl}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'manual-check', version: '1.0.0' },
      },
    });

    logResponse(logger, 'initialize', initializeResponse);

    const initializeJson = safeJsonParse(initializeResponse.body);
    const protocolVersion = initializeJson?.result?.protocolVersion || DEFAULT_PROTOCOL_VERSION;
    const followupHeaders = {
      'mcp-protocol-version': protocolVersion,
    };

    if (initializeResponse.headers['mcp-session-id']) {
      followupHeaders['mcp-session-id'] = initializeResponse.headers['mcp-session-id'];
    }

    const initializedResponse = await postJson(
      `${baseUrl}/mcp`,
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      },
      followupHeaders,
    );

    logResponse(logger, 'notifications/initialized', initializedResponse);

    const toolsListResponse = await postJson(
      `${baseUrl}/mcp`,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
      followupHeaders,
    );

    logResponse(logger, 'tools/list', toolsListResponse);

    const toolCallResponse = await postJson(
      `${baseUrl}/mcp`,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: 'hello',
          },
        },
      },
      followupHeaders,
    );

    logResponse(logger, 'tools/call', toolCallResponse);
  } finally {
    await app.close();
  }
}

async function postJson(url, payload, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function logResponse(logger, label, response) {
  logger.info(`\n[${label}] status=${response.status}`);
  logger.info(`headers=${JSON.stringify(response.headers, null, 2)}`);
  logger.info(`body=${response.body || '<empty>'}`);
}

function parseCliArgs(argv) {
  return {
    transportMode: argv.includes('--stateless') ? 'stateless' : 'stateful',
    hijackReply: !argv.includes('--no-hijack'),
    enableJsonResponse: !argv.includes('--sse'),
  };
}

if (require.main === module) {
  (async () => {
    try {
      await runManualMcpSdkCheck(parseCliArgs(process.argv.slice(2)));
    } catch (error) {
      console.error('MCP SDK manual check failed.', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  runManualMcpSdkCheck,
};