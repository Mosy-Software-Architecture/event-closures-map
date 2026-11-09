#!/usr/bin/env node
// npm run preview [-- --port 8080]: serves dist/ with the production headers.
import { join } from 'node:path';
import { ROOT, arg } from './lib/data.js';
import { serveDist } from './lib/serve.js';

const server = await serveDist(join(ROOT, 'dist'), Number(arg('--port') || 8080));
console.log(`preview of dist/ on http://127.0.0.1:${server.address().port}/ (production headers, Ctrl+C to stop)`);
