import { safeErrorMessage } from '@wisp/protocol/model-errors';
export function errorMessage(error: unknown): string {
  return safeErrorMessage(error instanceof Error ? error.message : String(error));
}
