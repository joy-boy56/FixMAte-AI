/**
 * Mock AI provider used by the leak regression test.
 *
 * It serves a provider-style 404 whose body embeds the model name, the
 * provider URL and a request id. The test asserts none of that reaches the
 * browser.
 *
 * Run as a child process so AI_BASE_URL is set before the OpenAI client is
 * ever created (the client is cached on first use).
 */

const http = require('http');
const path = require('path');

const SECRET_MODEL = 'nvidia/nemotron-secret';
const SECRET_HOST = 'provider.example';
const SECRET_REQUEST_ID = 'req_super_secret';

const server = http.createServer((req, res) => {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: {
        message:
          'The model `' +
          SECRET_MODEL +
          '` does not exist at https://' +
          SECRET_HOST +
          '/v1',
        request_id: SECRET_REQUEST_ID,
      },
    })
  );
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  process.env.AI_BASE_URL = 'http://127.0.0.1:' + port + '/v1';

  const { generateGeneralAnalysis } = require(
    path.join(__dirname, '..', '..', 'src', 'analysis', 'aiAnalyzer.js')
  );

  try {
    const ga = await generateGeneralAnalysis(
      [
        {
          file: 'a.py',
          line: 1,
          type: 'error',
          code: 'E1',
          message: 'boom',
          language: 'python',
        },
      ],
      [{ path: 'a.py', language: 'python', content: 'x=1' }],
      'fast'
    );
    console.log('RESULT ' + JSON.stringify(ga));
  } catch (err) {
    console.log('THREW ' + err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
