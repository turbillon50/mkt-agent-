import cron from 'node-cron';
import { config } from './config';
import { runOnce, ensurePlan } from './runner';
import { buildPlan } from './planner';

export function start(): void {
  const { postCron, planCron, timezone } = config.schedule;

  console.log(`[scheduler] post cron "${postCron}" (${timezone})`);
  console.log(`[scheduler] plan cron "${planCron}" (${timezone})`);

  cron.schedule(postCron, async () => {
    try {
      await ensurePlan();
      const { publicados, saltados } = await runOnce();
      console.log(
        `[scheduler] ${publicados.length} publicado(s), ${saltados.length} saltado(s) a las ${new Date().toISOString()}`,
      );
      for (const s of saltados) console.log(`[scheduler]   ${s.projectName}: ${s.motivo}`);
    } catch (err: any) {
      console.error('[scheduler] post run failed:', err.message ?? err);
    }
  }, { timezone });

  cron.schedule(planCron, async () => {
    try {
      const plan = await buildPlan();
      console.log(`[scheduler] new weekly plan: ${plan.items.length} items`);
    } catch (err: any) {
      console.error('[scheduler] plan run failed:', err.message ?? err);
    }
  }, { timezone });

  const stop = () => { console.log('\n[scheduler] stopping'); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
