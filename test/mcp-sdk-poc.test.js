const test = require('node:test');
const assert = require('node:assert/strict');

const { createSdkPocServer } = require('../src/mcp/sdk-poc');

const JSON_HEADERS = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
};

test('SDK MCP PoC serves initialize, tools/list and tools/call through Fastify', async () => {
  const app = await createSdkPocServer({
    logger: false,
    hijackReply: true,
  });

  try {
    const initializeResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: JSON_HEADERS,
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      },
    });

    assert.equal(initializeResponse.statusCode, 200);
    const initializeJson = initializeResponse.json();

    assert.equal(initializeJson.result.serverInfo.name, 'gitlab-watcher-sdk-poc');

    const sessionId = initializeResponse.headers['mcp-session-id'];
    const protocolVersion = initializeJson.result.protocolVersion;

    assert.ok(sessionId);
    assert.ok(protocolVersion);

    const initializedResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        ...JSON_HEADERS,
        'mcp-protocol-version': protocolVersion,
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      },
    });

    assert.ok(initializedResponse.statusCode >= 200 && initializedResponse.statusCode < 300);

    const toolsListResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        ...JSON_HEADERS,
        'mcp-protocol-version': protocolVersion,
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      },
    });

    assert.equal(toolsListResponse.statusCode, 200);
    assert.ok(toolsListResponse.json().result.tools.some((tool) => tool.name === 'echo'));

    const toolCallResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        ...JSON_HEADERS,
        'mcp-protocol-version': protocolVersion,
        'mcp-session-id': sessionId,
      },
      payload: {
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
    });

    assert.equal(toolCallResponse.statusCode, 200);
    assert.equal(toolCallResponse.json().result.content[0].text, 'echo:hello');
  } finally {
    await app.close();
  }
});