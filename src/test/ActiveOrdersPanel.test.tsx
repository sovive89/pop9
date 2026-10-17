import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactNode } from "react";
const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("@/hooks/useSessionStore", () => ({ useSessionStore: () => ({ sessions: {}, markDelivered: vi.fn() }) }));
vi.mock("@/hooks/useDeliveredOrders", () => ({ useDeliveredOrders: mocks.history }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) => <div className={props.className}>{children}</div> },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
import ActiveOrdersPanel from "@/components/ActiveOrdersPanel";
afterEach(cleanup);
describe("delivered orders view", () => {
  it("keeps the delivered filter accessible with no active tables and displays history", () => {
    mocks.history.mockImplementation((enabled: boolean) => ({ loading: false, error: false, more: false, orders: enabled ? [{
      tableNumber: 2, clientName: "Ricardo", clientId: "client", order: { id: "closed-session-order", status: "delivered", placedAt: new Date(), items: [{ menuItemId: "burger", name: "Hambúrguer", price: 20, quantity: 1 }] },
    }] : [] }));
    render(<ActiveOrdersPanel />);
    expect(screen.getByText("Nenhum pedido ativo no momento")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entregues" }));
    expect(screen.getByText("Hambúrguer")).toBeInTheDocument();
    expect(screen.getByText("Mesa 02")).toBeInTheDocument();
    expect(screen.getByLabelText("Data do pedido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entregue" })).not.toBeInTheDocument();
  });
  it("shows retry instead of a misleading empty history after a failure", () => {
    const retry = vi.fn();
    mocks.history.mockReturnValue({ loading: false, error: true, more: false, orders: [], retry });
    render(<ActiveOrdersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Entregues" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum pedido entregue nesta data")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
