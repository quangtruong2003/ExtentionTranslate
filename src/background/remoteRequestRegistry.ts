export class DictionaryRemoteRequestRegistry {
  private readonly controllers = new Map<number, AbortController>();

  set(requestId: number, controller: AbortController): void {
    this.controllers.get(requestId)?.abort();
    this.controllers.set(requestId, controller);
  }

  cancel(requestId: number): boolean {
    const controller = this.controllers.get(requestId);
    if (!controller) return false;
    this.controllers.delete(requestId);
    controller.abort();
    return true;
  }

  finish(requestId: number, controller: AbortController): void {
    if (this.controllers.get(requestId) === controller) {
      this.controllers.delete(requestId);
    }
  }
}
