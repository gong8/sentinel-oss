const http = require('http');

const PORTS = [3001, 3002, 3003];

const servers = PORTS.map((port) => {
  const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check for Playwright
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    // Handle MCP requests
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          const response = {
            jsonrpc: '2.0',
            id: json.id || 1,
          };

          if (json.method === 'initialize') {
            response.result = {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'mock-server', version: '1.0.0' },
            };
          } else if (json.method === 'tools/list') {
            response.result = {
              tools: [
                { name: 'mock_tool', description: 'A mock tool' },
                { name: 'create_pull_request', description: 'Mock PR tool' },
                { name: 'get_file_contents', description: 'Mock file tool' },
                { name: 'merge_pull_request', description: 'Mock merge tool' },
                { name: 'create_page', description: 'Mock page tool' },
                { name: 'update_page', description: 'Mock update page tool' },
                { name: 'send_message', description: 'Mock send message tool' },
                { name: 'create_issue', description: 'Mock create issue' },
                { name: 'list_repositories', description: 'Mock list repos' },
                { name: 'get_repository_info', description: 'Mock repo info' },
                { name: 'comment_on_issue', description: 'Mock comment' },
                { name: 'list_branches', description: 'Mock branches' },
                { name: 'create_branch', description: 'Mock create branch' },
                { name: 'get_commit_history', description: 'Mock history' },
                { name: 'get_page_content', description: 'Mock page content' },
                { name: 'search_pages', description: 'Mock search' },
                { name: 'create_database', description: 'Mock db' },
                { name: 'query_database', description: 'Mock query' },
                { name: 'add_page_to_database', description: 'Mock add page' },
                { name: 'get_page_properties', description: 'Mock properties' },
                { name: 'update_page_properties', description: 'Mock update props' },
                { name: 'archive_page', description: 'Mock archive' },
                { name: 'get_channel_history', description: 'Mock history' },
                { name: 'create_channel', description: 'Mock channel' },
                { name: 'list_channels', description: 'Mock channels' },
                { name: 'upload_file', description: 'Mock upload' },
              ],
            };
          } else {
            response.result = {};
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch {
          // If body is empty or invalid JSON, and it's a POST, it might be a probe
          // Just return success for probe
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    console.log(`Mock MCP Server running on port ${port}`);
  });

  return server;
});

// Handle cleanup
process.on('SIGINT', () => {
  servers.forEach((s) => s.close());
  process.exit();
});

process.on('SIGTERM', () => {
  servers.forEach((s) => s.close());
  process.exit();
});
