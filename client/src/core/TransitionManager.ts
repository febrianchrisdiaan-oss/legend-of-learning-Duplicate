// client/src/core/TransitionManager.ts
export const TransitionManager = {
  close(callback: () => void = () => {}): void {
    const overlay = document.getElementById("transition-overlay");
    if (!overlay) {
      callback();
      return;
    }
    overlay.classList.add("overlay-active"); // fade ke hitam

    setTimeout(() => {
      try {
        callback();
      } catch (e) {
        console.error(e);
      }
    }, 400);
  },

  open(): void {
    const overlay = document.getElementById("transition-overlay");
    if (!overlay) return;
    setTimeout(() => {
      overlay.classList.remove("overlay-active"); // fade balik transparan
    }, 50);
  },

  transitionTo(callback: () => void): void {
    this.close(() => {
      callback();
      this.open();
    });
  },
};