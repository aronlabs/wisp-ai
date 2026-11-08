export class RuntimeResources {
  private cleanup: (() => void | Promise<unknown>)[] = [];
  private closing?: Promise<void>;
  defer(dispose: () => void | Promise<unknown>) {
    this.cleanup.push(dispose);
  }
  close(): Promise<void> {
    return (this.closing ??= this.dispose());
  }
  private async dispose() {
    const errors: unknown[] = [];
    for (const cleanup of this.cleanup.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    this.cleanup = [];
    if (errors.length) {
      throw new AggregateError(errors, 'Runtime cleanup failed');
    }
  }
}
