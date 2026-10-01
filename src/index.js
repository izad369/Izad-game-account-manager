// Game Account Manager — Cloudflare Worker entrypoint
// One account for all your games. Games talk to /api/* with CORS enabled.

import { AccountDO } from './account.js';

export { AccountDO };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const id = env.ACCOUNTS.idFromName('accounts');
      const stub = env.ACCOUNTS.get(id);
      // Rewrite /api/xyz -> /xyz inside the Durable Object
      const inner = new Request(request);
      const newUrl = new URL(request.url);
      newUrl.pathname = url.pathname.slice(4) || '/';
      return stub.fetch(new Request(newUrl, inner));
    }

    // Static site (public/)
    return env.ASSETS.fetch(request);
  },
};
