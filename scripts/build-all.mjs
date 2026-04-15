import { runWorkspaceSteps } from './run-workspace-steps.mjs';

const steps = [
  { name: 'Build shared', args: ['--filter', 'chrome-mcp-shared', 'build'] },
  { name: 'Build extension', args: ['--filter', 'chrome-mcp-server', 'build'] },
  { name: 'Build native-server', args: ['--filter', 'mcp-chrome-bridge', 'build'] },
  { name: 'Build wasm', args: ['--filter', '@chrome-mcp/wasm-simd', 'build'] },
];

runWorkspaceSteps({
  title: 'Running full workspace build...',
  successMessage: 'All builds passed.',
  steps,
});
