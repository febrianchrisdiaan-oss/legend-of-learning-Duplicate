// client/src/core/Router.ts
export class Router {
  static navigate(path: string): void {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new CustomEvent("routechange", { detail: { path } }));
  }

  static replace(path: string): void {
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new CustomEvent("routechange", { detail: { path } }));
  }

  static getPath(): string {
    return window.location.pathname;
  }

  private static normalize(path: string): string {
    try {
      path = decodeURIComponent(path);
    } catch {
      // ignore
    }
    if (path === "/") return path;
    return path.replace(/\/+$/, "");
  }

  static match(pattern: string, path?: string): Record<string, string> | null {
    const currentPath = this.normalize(path ?? window.location.pathname);
    const normPattern = this.normalize(pattern);
    const patternParts = normPattern.split("/").filter((p) => p.length > 0);
    const pathParts = currentPath.split("/").filter((p) => p.length > 0);
    if (patternParts.length !== pathParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
      const seg = patternParts[i];
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (seg !== pathParts[i]) {
        return null;
      }
    }
    return params;
  }

  static is(path: string): boolean {
    return this.normalize(window.location.pathname) === this.normalize(path);
  }
}