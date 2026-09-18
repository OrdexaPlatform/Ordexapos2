import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server';

// Serverless function handler for Vercel
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
