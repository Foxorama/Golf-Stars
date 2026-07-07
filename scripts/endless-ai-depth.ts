/**
 * Headless measurement: how deep does the auto-AI survive in the Unending Universe?
 *
 * Run with:  npx vite-node scripts/endless-ai-depth.ts        (SEEDS=500 to widen the sample)
 *
 * Motivation (see reports/endless-ai-depth-2026-07-04.md): if a "warp" feature fast-forwards the
 * early Unending holes by auto-resolving stops with `playStop`, the auto-AI's own survival depth is
 * warp's practical ceiling — so we measure it across seeds, shop/route strategies, and the four
 * starting club sets (the mode's difficulty axis). Pure sim only; re-run after any endless-AI,
 * dispersion, or balance tuning to see the ceiling move.
 */
import { startRun, playStop, buy, shopOffer, routeOptions, travel, travelRefuelCost } from '../src/sim/rpg/run';
import type { Run, Route } from '../src/sim/rpg/run';
import type { BagTier } from '../src/sim/rpg/bag';

interface StrategyCfg {
  name: string;
  bagTier: BagTier;
  greedyShop: boolean;
  pickRoute: (routes: Route[]) => Route;
}

const firstRoute = (routes: Route[]) => routes[0]!;
const shallowest = (routes: Route[]) =>
  routes.reduce((best, r) => (r.distanceJump < best.distanceJump ? r : best), routes[0]!);

/** Buy affordable gear until the shop has nothing left we can pay for (a decent player proxy). */
function greedyBuy(run: Run): Run {
  for (let i = 0; i < 40; i++) {
    const offer = shopOffer(run);
    // Most expensive affordable first — players grab the big upgrade, then fill with cheap kit.
    const affordable = offer.filter((o) => o.cost <= run.credits).sort((a, b) => b.cost - a.cost);
    if (!affordable.length) break;
    const next = buy(run, affordable[0]!.item.id);
    if (next === run) break; // no-op guard (caddy exclusivity etc.)
    run = next;
  }
  return run;
}

function playRun(seed: number, cfg: StrategyCfg, maxStops = 200): number {
  let run = startRun(seed, 'unending', {}, undefined, 0, cfg.bagTier, []);
  for (let i = 0; i < maxStops && run.status === 'active'; i++) {
    run = playStop(run).run;
    if (run.status !== 'active') break;
    if (cfg.greedyShop) run = greedyBuy(run);
    // Prefer the picked lane, but fall back to the cheapest affordable one — a real player never picks a
    // lane they can't fuel (the game locks those); an all-unaffordable board strands the run.
    const routes = routeOptions(run);
    const pick = cfg.pickRoute(routes);
    const affordable = routes.filter((r) => travelRefuelCost(run, r) <= run.credits);
    const lane = (affordable.includes(pick) ? pick : affordable.sort((a, b) => a.distanceJump - b.distanceJump)[0]) ?? undefined;
    if (!lane) break; // stranded
    run = travel(run, lane);
  }
  return run.holesSurvived;
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const SEEDS = Number(process.env.SEEDS ?? 200);
const CONFIGS: StrategyCfg[] = [
  { name: 'green | no shop | route[0]   (test default)', bagTier: 'common', greedyShop: false, pickRoute: firstRoute },
  { name: 'green | greedy  | route[0]', bagTier: 'common', greedyShop: true, pickRoute: firstRoute },
  { name: 'green | greedy  | shallowest (survival proxy)', bagTier: 'common', greedyShop: true, pickRoute: shallowest },
  { name: 'blue  | greedy  | shallowest', bagTier: 'rare', greedyShop: true, pickRoute: shallowest },
  { name: 'purple| greedy  | shallowest', bagTier: 'epic', greedyShop: true, pickRoute: shallowest },
  { name: 'orange| greedy  | shallowest', bagTier: 'legendary', greedyShop: true, pickRoute: shallowest },
];

// Per-SET survival bands for the death histogram (endless.ts ENDLESS_SET_STEPS, two sets = 8 holes per band).
const TIER_LABELS = [
  'sets1-2 +4',
  'sets3-4 +3',
  'sets5-6 +2',
  'sets7-8 +1',
  'sets9-10 E',
  'sets11-12 −1',
  'sets13-14 −2',
  'sets15-16 −3',
  'sets17+ −4',
];

for (const cfg of CONFIGS) {
  const t0 = performance.now();
  const depths: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) depths.push(playRun(seed, cfg));
  const sorted = [...depths].sort((a, b) => a - b);
  const mean = depths.reduce((s, d) => s + d, 0) / depths.length;
  const reach = (n: number) => ((100 * depths.filter((d) => d >= n).length) / depths.length).toFixed(0);
  const deaths = new Array(TIER_LABELS.length).fill(0);
  for (const d of depths) deaths[Math.min(Math.floor(d / 8), TIER_LABELS.length - 1)]++;
  console.log(`\n=== ${cfg.name}  (${SEEDS} seeds, ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(
    `  mean ${mean.toFixed(1)} | min ${sorted[0]} | p25 ${pct(sorted, 25)} | median ${pct(sorted, 50)} | p75 ${pct(sorted, 75)} | p90 ${pct(sorted, 90)} | max ${sorted[sorted.length - 1]}`,
  );
  console.log(`  reach: 8→${reach(8)}%  16→${reach(16)}%  24→${reach(24)}%  32→${reach(32)}%  40→${reach(40)}%  48→${reach(48)}%`);
  console.log(`  died at bar: ${TIER_LABELS.map((l, i) => `${l}: ${deaths[i]}`).join(' | ')}`);
}
