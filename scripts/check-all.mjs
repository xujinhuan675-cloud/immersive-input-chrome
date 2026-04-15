import { runWorkspaceSteps } from './run-workspace-steps.mjs';

const steps = [
  { name: 'Lint', args: ['lint'] },
  { name: 'Typecheck', args: ['typecheck'] },
  { name: 'Build shared', args: ['--filter', 'chrome-mcp-shared', 'build'] },
  { name: 'Build extension', args: ['--filter', 'chrome-mcp-server', 'build'] },
  { name: 'Test extension', args: ['--filter', 'chrome-mcp-server', 'test'] },
  { name: 'Build native-server', args: ['--filter', 'mcp-chrome-bridge', 'build'] },
  { name: 'Test native-server', args: ['--filter', 'mcp-chrome-bridge', 'test'] },
  { name: 'Build wasm', args: ['--filter', '@chrome-mcp/wasm-simd', 'build'] },
  { name: 'Test wasm', args: ['--filter', '@chrome-mcp/wasm-simd', 'test'] },
];

runWorkspaceSteps({
  title: 'Running full workspace verification...',
  successMessage: 'All checks passed.',
  steps,
});
