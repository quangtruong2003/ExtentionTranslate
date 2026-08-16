import { POPUP_HOST_ID } from "@/shared/constants";

export interface MountedShadowRoot {
  host: HTMLElement;
  shadow: ShadowRoot;
  container: HTMLElement;
}

const buttonActions = new WeakMap<HTMLButtonElement, () => void>();

export function registerShadowButtonAction(button: HTMLButtonElement, action: () => void): () => void {
  buttonActions.set(button, action);
  return () => buttonActions.delete(button);
}

export function mountShadowHost(into: HTMLElement = document.body): MountedShadowRoot {
  let host = document.getElementById(POPUP_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = POPUP_HOST_ID;
    host.setAttribute("data-extention-translate", "");
    // Use closed shadow root so host pages can't inspect contents.
    Object.assign(host.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      zIndex: "2147483647",
      pointerEvents: "auto",
    });
    into.appendChild(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "closed" });
  // Reset existing stylesheets to avoid duplicates
  shadow.querySelectorAll("style[data-ext-shadow]").forEach((el) => el.remove());
  shadow.querySelectorAll("link[data-ext-shadow]").forEach((el) => el.remove());

  const container = document.createElement("div");
  container.setAttribute("data-ext-root", "");
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "auto";
  shadow.appendChild(container);

  let lastForwardedPress = { x: Number.NaN, y: Number.NaN, at: 0 };
  const forwardPress = (event: MouseEvent) => {
    const now = Date.now();
    if (event.clientX === lastForwardedPress.x && event.clientY === lastForwardedPress.y && now - lastForwardedPress.at < 50) return;
    lastForwardedPress = { x: event.clientX, y: event.clientY, at: now };
    const target = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      const rect = button.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (!target) return;
    const action = buttonActions.get(target);
    if (action) {
      action();
    } else {
      target?.click();
    }
  };
  host.addEventListener("pointerdown", forwardPress, true);
  host.addEventListener("mousedown", forwardPress, true);

  return { host, shadow, container };
}

export function adoptStylesheetIntoShadow(shadow: ShadowRoot, cssText: string): void {
  const style = document.createElement("style");
  style.setAttribute("data-ext-shadow", "");
  style.textContent = cssText;
  shadow.insertBefore(style, shadow.firstChild);
}

export function unmountShadowHost(): void {
  const host = document.getElementById(POPUP_HOST_ID);
  host?.remove();
}
