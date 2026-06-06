const test = require('node:test');
const assert = require('node:assert/strict');

const { createRequestRunner } = require('../src/request');

test('createRequestRunner adds PRIVATE-TOKEN from env and resolves running pipeline data for a tag', async () => {
  let receivedOptions;
  const originalToken = process.env.GITLAB_PRIVATE_TOKEN;
  process.env.GITLAB_PRIVATE_TOKEN = 'secret-token';

  const client = async (options) => {
    receivedOptions = options;

    return {
      data: [
        {
          id: 42,
          status: 'running',
        },
      ],
    };
  };

  const runRequest = createRequestRunner({
    client,
    baseUrl: 'https://gitlab.example/api/v4',
    projectId: '1',
  });

  try {
    const result = await runRequest({ tagName: 'v1.0.0' });

    assert.deepEqual(receivedOptions, {
      method: 'GET',
      url: 'https://gitlab.example/api/v4/projects/1/pipelines',
      params: {
        ref: 'v1.0.0',
      },
      headers: {
        'PRIVATE-TOKEN': 'secret-token',
      },
    });
    assert.deepEqual(result, {
      status: 'running',
      pipelineId: '42',
    });
  } finally {
    process.env.GITLAB_PRIVATE_TOKEN = originalToken;
  }
});

test('createRequestRunner returns not_found when GitLab does not return a pipeline for the tag', async () => {
  const originalToken = process.env.GITLAB_PRIVATE_TOKEN;
  process.env.GITLAB_PRIVATE_TOKEN = 'secret-token';

  const runRequest = createRequestRunner({
    client: async () => ({ data: [] }),
    baseUrl: 'https://gitlab.example/api/v4',
    projectId: '1',
  });

  try {
    const result = await runRequest({ tagName: 'v1.0.0' });

    assert.deepEqual(result, {
      status: 'not_found',
    });
  } finally {
    process.env.GITLAB_PRIVATE_TOKEN = originalToken;
  }
});

test('createRequestRunner throws when GITLAB_PRIVATE_TOKEN is missing', async () => {
  const originalToken = process.env.PRIVATE_TOKEN;
  delete process.env.GITLAB_PRIVATE_TOKEN;

  const runRequest = createRequestRunner({
    client: async () => {
      throw new Error('client should not be called without token');
    },
  });

  try {
    await assert.rejects(runRequest({ tagName: 'v1.0.0' }), {
      message: 'Missing GITLAB_PRIVATE_TOKEN in environment.',
    });
  } finally {
    process.env.GITLAB_PRIVATE_TOKEN = originalToken;
  }
});
