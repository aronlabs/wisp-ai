import { defineSandbox } from 'eve/sandbox';
import { JustBashSandbox } from 'eve/sandbox/just-bash';

// Eve uses a workspace for its own lifecycle even with default tools disabled.
// Bundle its engine explicitly; startup must never install packages or probe Docker.
export const environment = JustBashSandbox.environment({ autoInstall: false });
export default defineSandbox(() => environment.open());
