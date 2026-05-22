const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

function createRequestRunner({
  client = axios,
  baseUrl = process.env.BASE_URL,
  projectId = process.env.PROJECT_ID,
} = {}) {
  return async function runRequest({ tagName }) {
    const privateToken = process.env.PRIVATE_TOKEN;

    if (!privateToken) {
      throw new Error('Missing PRIVATE_TOKEN in environment.');
    }

    const response = await client({
      method: 'GET',
      url: `${baseUrl}/projects/${projectId}/pipelines`,
      params: {
        ref: tagName,
      },
      headers: {
        'PRIVATE-TOKEN': privateToken,
      },
    });

    const latestPipeline = Array.isArray(response.data) ? response.data[0] : null;

    if (!latestPipeline) {
      return {
        status: 'not_found',
      };
    }

    return {
      status: normalizePipelineStatus(latestPipeline.status),
      pipelineId: String(latestPipeline.id),
    };
  };
}

function normalizePipelineStatus(status) {
  if (status === 'success' || status === 'failed' || status === 'canceled') {
    return status;
  }

  return 'running';
}

module.exports = {
  createRequestRunner,
  normalizePipelineStatus,
};
