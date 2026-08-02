import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { chromePath } from './chromium';

/**
 * AN INSTALLED APP MUST PICK UP A DEPLOY ON ITS NEXT LAUNCH (GS-sw-stale).
 *
 * The play-test report was *"on my mobile phone, which is the app installed from
 * farcarry.vulpecula.games, it's still not updated and I've cleared cache on the app"*, with the
 * important part: *"I don't have any way to identify who would end up with a stale app."*
 *
 * The cause was NOT the service worker's caching policy, which is network-first and was working as
 * designed. It is that `fetch(req)` inside a worker reads the browser's ordinary HTTP cache like any
 * other fetch, and GitHub Pages serves this game's single-file index.html with
 * `Cache-Control: max-age=600` — a header Pages gives you no way to change. So for ten minutes after
 * any load, "network-first" answers a navigation from the HTTP cache without asking the server, and a
 * relaunch inside that window renders the PREVIOUS build.
 *
 * That was established by removing the worker ENTIRELY and watching the staleness survive, which is
 * the observation this whole file exists to keep true: the shell must be revalidated on every launch.
 *
 * These cases drive a REAL persistent browser profile against a REAL server, because that is the only
 * place the bug exists — the service worker, its CacheStorage and the HTTP cache all have to survive
 * across "app launches" for it to appear at all, and none of them do in an ordinary test page.
 */

/** A miniature deploy target: the real `public/sw.js`, and an index.html whose body we can swap. */
function deployServer(swSource: string) {
  let build = 'BUILD-1';
  const srv = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (body: string, type: string): void => {
      res.setHeader('content-type', type);
      // GitHub Pages' own header, which is the entire point of the test.
      res.setHeader('cache-control', 'max-age=600');
      res.end(body);
    };
    if (path === '/' || path === '/index.html') {
      return send(
        `<!doctype html><meta charset=utf8><body><h1 id=b>${build}</h1>` +
          `<script>navigator.serviceWorker&&navigator.serviceWorker.register('sw.js',{updateViaCache:'none'})</script>`,
        'text/html',
      );
    }
    if (path === '/sw.js') return send(swSource, 'text/javascript');
    if (path === '/manifest.webmanifest') return send('{}', 'application/manifest+json');
    res.statusCode = 404;
    res.end('');
  });
  return {
    srv,
    deploy: (b: string): void => {
      build = b;
    },
  };
}

/** Launch, navigate, read what the page rendered, close — one "app launch". */
async function launchAndRead(profile: string, origin: string): Promise<string> {
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath!,
    args: ['--no-sandbox'],
  });
  try {
    const page = await ctx.newPage();
    await page.goto(origin + '/', { waitUntil: 'load' });
    // Give the worker a beat to register/claim on the first launch.
    await page.waitForTimeout(700);
    return (await page.textContent('#b')) ?? '';
  } finally {
    await ctx.close();
  }
}

async function runDeployCycle(swSource: string): Promise<{ before: string; after: string }> {
  const { srv, deploy } = deployServer(swSource);
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  const origin = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const profile = mkdtempSync(join(tmpdir(), 'gs-swtest-'));
  try {
    await launchAndRead(profile, origin); // install
    const before = await launchAndRead(profile, origin); // relaunch, nothing deployed
    deploy('BUILD-2'); // …a deploy happens…
    const after = await launchAndRead(profile, origin); // relaunch
    return { before, after };
  } finally {
    srv.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const SW = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8').split('%GS_VERSION%').join('test');

describe('an installed app picks up a deploy on its next launch (GS-sw-stale)', () => {
  it.runIf(chromePath)(
    'the shipped worker serves the NEW build immediately after a deploy',
    async () => {
      const { before, after } = await runDeployCycle(SW);
      expect(before, 'nothing deployed yet').toBe('BUILD-1');
      expect(after, 'a relaunch after a deploy must show the new build').toBe('BUILD-2');
    },
    120_000,
  );

  it.runIf(chromePath)(
    '…and the test can SEE the bug: drop the revalidation and the app goes stale again',
    async () => {
      // Verified-red by construction. Without this case the assertion above passes on the broken
      // worker too — `max-age=600` only bites while the entry is fresh, so a test that merely waited
      // would report green on a build that strands every player for ten minutes after each deploy.
      const broken = SW.replace(/fetch\(req\.url, \{ cache: 'no-cache'[^)]*\)/, 'fetch(req)');
      expect(broken, 'the fixture must actually differ from the shipped worker').not.toBe(SW);
      const { after } = await runDeployCycle(broken);
      expect(after, 'without `no-cache` the HTTP cache answers and the deploy is invisible').toBe('BUILD-1');
    },
    120_000,
  );
});
