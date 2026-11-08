import { startBridge } from './runtime.ts';
import { errorMessage } from './errors.ts';
try {
  const bridge = await startBridge();
  const stop = () => {
    void bridge.stop().catch((error) => {
      console.error(errorMessage(error));
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
