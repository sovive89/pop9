import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { getTooltipText } from "@/lib/tooltip-text";

const TARGETS = [
  "button", "a[href]", "input:not([type=hidden])", "select", "textarea",
  "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]", "[role=switch]",
  "[role=menuitem]", "[role=menuitemcheckbox]", "[role=menuitemradio]",
  "[role=combobox]", "[role=radio]", "[role=slider]", "[data-tooltip]", "[title]",
].join(",");

/** One delegated tooltip covers routes, custom controls and portalled dialogs
 * without adding wrappers that could change flex/grid layout or button refs. */
export function GlobalTooltips() {
  const id = useId();
  const [active, setActive] = useState<{ target: Element; text: string } | null>(null);
  const { refs, floatingStyles } = useFloating({
    placement: "top",
    strategy: "fixed",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => { refs.setReference(active?.target ?? null); }, [active, refs]);

  useEffect(() => {
    let hovered: Element | null = null;
    let focused: Element | null = null;
    let current: Element | null = null;
    let title: string | null = null;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    const removeDescription = () => {
      if (!current) return;
      const remaining = (current.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(token => token && token !== id);
      if (remaining.length) current.setAttribute("aria-describedby", remaining.join(" "));
      else current.removeAttribute("aria-describedby");
      if (title !== null && !current.hasAttribute("title")) current.setAttribute("title", title);
      current.removeAttribute("data-tooltip-native-title");
      current = null;
      title = null;
    };
    const close = () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      removeDescription();
      setActive(null);
    };
    const find = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target.closest("[data-global-tooltip]")) return null;
      const element = target.closest(TARGETS);
      if (!element || element.closest('[data-tooltip="false"], [hidden], [aria-hidden="true"], [inert]')) return null;
      return getTooltipText(element) ? element : null;
    };
    const open = (target: Element, immediate = false) => {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      if (target === current) return;
      removeDescription();
      setActive(null);
      openTimer = setTimeout(() => {
        if (!target.isConnected) return;
        // Respect local Radix tooltips already describing this trigger.
        const described = (target.getAttribute("aria-describedby") ?? "").split(/\s+/);
        if (described.some(token => document.getElementById(token)?.getAttribute("role") === "tooltip")) return;
        const text = getTooltipText(target);
        if (!text) return;
        current = target;
        title = target.getAttribute("title");
        if (title !== null) target.setAttribute("data-tooltip-native-title", title);
        target.removeAttribute("title");
        target.setAttribute("aria-describedby", [...described.filter(Boolean), id].join(" "));
        setActive({ target, text });
      }, immediate ? 0 : 450);
    };
    const leave = () => {
      clearTimeout(openTimer);
      closeTimer = setTimeout(() => {
        if (focused?.isConnected) open(focused, true);
        else close();
      }, 150);
    };
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (event.target instanceof Element && event.target.closest("[data-global-tooltip]")) {
        clearTimeout(closeTimer);
        return;
      }
      const target = find(event.target);
      if (target) { hovered = target; open(target); }
    };
    const pointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (hovered?.contains(event.relatedTarget as Node | null)) return;
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-global-tooltip]")) return;
      hovered = null;
      leave();
    };
    const focusIn = (event: FocusEvent) => {
      focused = find(event.target);
      if (focused) open(focused, true);
    };
    const focusOut = () => {
      focused = null;
      if (hovered) open(hovered);
      else close();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { hovered = null; focused = null; close(); }
    };
    // Delegation includes elements mounted later, even outside the React root.
    document.addEventListener("pointerover", pointerOver, true);
    document.addEventListener("pointerout", pointerOut, true);
    document.addEventListener("focusin", focusIn, true);
    document.addEventListener("focusout", focusOut, true);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("click", close, true);
    document.addEventListener("keydown", keyDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("popstate", close);
    const observer = new MutationObserver(() => {
      if (current && (!current.isConnected || current.closest('[hidden], [aria-hidden="true"], [inert]'))) close();
      else if (current) {
        const text = getTooltipText(current);
        if (!text) close();
        else setActive(previous => previous && previous.text !== text ? { ...previous, text } : previous);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-tooltip", "aria-label", "aria-hidden", "hidden", "inert", "disabled"] });
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      observer.disconnect();
      removeDescription();
      document.removeEventListener("pointerover", pointerOver, true);
      document.removeEventListener("pointerout", pointerOut, true);
      document.removeEventListener("focusin", focusIn, true);
      document.removeEventListener("focusout", focusOut, true);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("click", close, true);
      document.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("popstate", close);
    };
  }, [id]);

  if (!active) return null;
  // Keep descriptions inside a modal's accessibility tree and focus scope.
  const container = active.target.closest('[role="dialog"], [role="alertdialog"]') ?? document.body;
  return createPortal(
    <div id={id} ref={refs.setFloating} role="tooltip" data-global-tooltip
      style={floatingStyles}
      className="pointer-events-auto z-[1000] max-w-[min(20rem,calc(100vw-1rem))] whitespace-normal break-words rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg">
      {active.text}
    </div>, container,
  );
}
