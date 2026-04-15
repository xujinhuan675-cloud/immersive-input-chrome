import { spawnSync } from 'node:child_process';
import process from 'node:process';

const pnpmCommand = 'pnpm';

export function runWorkspaceSteps({ title, successMessage, steps }) {
  console.log(title);

  steps.forEach((step, index) => {
    const label = `[${index + 1}/${steps.length}] ${step.name}`;
    console.log(`\n==> ${label}`);

    const startedAt = Date.now();
    const result = spawnSync(pnpmCommand, step.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
    });
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (result.error) {
      console.error(`\n[FAIL] ${step.name} could not start: ${result.error.message}`);
      process.exit(1);
    }

    if (result.status !== 0) {
      console.error(`\n[FAIL] ${step.name} failed after ${durationSeconds}s.`);
      process.exit(result.status ?? 1);
    }

    console.log(`[OK] ${step.name} finished in ${durationSeconds}s.`);
  });

  console.log(`\n${successMessage}`);
}
