// client/src/core/PageManager.ts
import { Router } from "./Router";
import { TransitionManager } from "./TransitionManager";

export interface PageContext {
  container: HTMLElement;
  params: Record<string, string>;
}

/** Tiap halaman wajib punya mount(), boleh punya unmount() untuk cleanup listener dll. */
export interface PageModule {
  mount(ctx: PageContext): void;
  unmount?(): void;
}

interface RouteEntry {
  pattern: string;
  page: PageModule;
}

export class PageManager {
  private routes: RouteEntry[] = [];
  private container: HTMLElement;
  private currentPage: PageModule | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`PageManager: container #${containerId} tidak ditemukan`);
    this.container = el;

    window.addEventListener("popstate", () => this.resolve());
    window.addEventListener("routechange", () => this.resolve());
  }

  register(pattern: string, page: PageModule): this {
    this.routes.push({ pattern, page });
    return this;
  }

  /** Panggil sekali di awal, setelah semua register() selesai. */
  start(): void {
    this.resolve(true);
  }

  private resolve(isInitial = false): void {
    for (const route of this.routes) {
      const params = Router.match(route.pattern);
      if (params) {
        this.activate(route.page, params, isInitial);
        return;
      }
    }
    console.warn(`[PageManager] Tidak ada route cocok untuk "${Router.getPath()}"`);
  }

  private activate(page: PageModule, params: Record<string, string>, isInitial: boolean): void {
    if (page === this.currentPage) return; // sudah di halaman yang sama

    const doMount = (): void => {
      this.currentPage?.unmount?.();
      this.container.innerHTML = "";
      this.currentPage = page;
      page.mount({ container: this.container, params });
    };

    if (isInitial) {
      doMount(); // halaman pertama, tidak perlu transisi
    } else {
      TransitionManager.transitionTo(doMount);
    }
  }
}