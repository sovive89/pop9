import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalTooltips } from "@/components/GlobalTooltips";

const advance = async (time = 450) => { await act(async () => { vi.advanceTimersByTime(time); }); };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("tooltips across the application", () => {
  it("covers native buttons and links, with delayed hover and keyboard focus", async () => {
    render(<><GlobalTooltips /><button data-tooltip="Salve o cardápio">Salvar</button><a href="/cozinha">Cozinha</a></>);
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await advance();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Salve o cardápio");
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute("aria-describedby");
    fireEvent.focusIn(screen.getByRole("link"));
    await advance(0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Abra a cozinha");
  });

  it("covers controls mounted later inside dialogs and preserves existing descriptions", async () => {
    const { rerender } = render(<GlobalTooltips />);
    rerender(<><GlobalTooltips /><div role="dialog"><p id="hint">Obrigatório</p><button aria-describedby="hint" aria-label="Adicionar insumo">+</button></div></>);
    const button = screen.getByRole("button");
    fireEvent.focusIn(button);
    await advance(0);
    expect(screen.getByRole("dialog")).toContainElement(screen.getByRole("tooltip"));
    expect(button.getAttribute("aria-describedby")).toContain("hint");
    fireEvent.focusOut(button);
    expect(button).toHaveAttribute("aria-describedby", "hint");
  });

  it("keeps the tooltip open while the pointer moves over its text", async () => {
    render(<><GlobalTooltips /><button>Salvar</button></>);
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    await advance();
    const tooltip = screen.getByRole("tooltip");
    fireEvent.pointerOut(button, { relatedTarget: tooltip });
    fireEvent.pointerOver(tooltip);
    await advance(200);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerOut(tooltip, { relatedTarget: document.body });
    await advance(200);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows disabled control help and leaves actions disabled", async () => {
    const onClick = vi.fn();
    render(<><GlobalTooltips /><button disabled onClick={onClick}>Salvar</button></>);
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    await advance();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Indisponível no momento");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses labels rather than input values and restores native titles", async () => {
    render(<><GlobalTooltips /><label htmlFor="key">Chave da API</label><input id="key" type="password" defaultValue="private-secret" /><button title="Copiar webhook" /></>);
    fireEvent.focusIn(screen.getByLabelText("Chave da API"));
    await advance(0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Chave da API");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("private-secret");
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    await advance();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Copiar webhook");
    expect(button).not.toHaveAttribute("title");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).toHaveAttribute("title", "Copiar webhook");
  });

  it("removes a tooltip when its trigger disappears and respects opt-out", async () => {
    const { rerender } = render(<><GlobalTooltips /><button>Salvar</button></>);
    fireEvent.pointerOver(screen.getByRole("button"));
    await advance();
    rerender(<><GlobalTooltips /><button data-tooltip="false">Novo</button></>);
    await act(async () => {});
    fireEvent.pointerOver(screen.getByRole("button"));
    await advance();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
