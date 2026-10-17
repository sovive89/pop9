import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),reload:vi.fn(),error:vi.fn(),success:vi.fn()}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:"cashier"},signOut:vi.fn()})}));
vi.mock("@/hooks/useCurrentBusinessUnit",()=>({useCurrentBusinessUnit:()=>({businessUnitId:"unit",units:[{id:"unit",name:"Confit"}]})}));
vi.mock("@/hooks/useUnitRoles",()=>({useUnitRoles:()=>({roles:["cashier"],canCashier:true,loading:false,error:false})}));
vi.mock("@/hooks/useClosureQueue",()=>({useClosureQueue:()=>({queue:[{id:"session",tableNumber:1,requestedAt:new Date().toISOString(),snapshot:{totalConsumed:20,totalService:0,totalPaid:0,remaining:20,openOrders:0,clients:[{id:"client",name:"João",remaining:20}]}}],loading:false,error:false,more:false,reload:mocks.reload})}));
vi.mock("@/hooks/useSessionStore",()=>({useSessionStore:()=>({sessions:{},requestCloseSession:vi.fn()})}));
vi.mock("@/components/CloseAccountPanel",()=>({default:()=>null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock("sonner",()=>({toast:{error:mocks.error,success:mocks.success}}));
import Cashier from "@/pages/Cashier";
afterEach(cleanup);beforeEach(()=>{mocks.invoke.mockReset();mocks.error.mockClear();mocks.success.mockClear();});
describe("cashier password and delinquency confirmation",()=>{
  it("requires a justification and preserves the request on wrong password",async()=>{
    render(<MemoryRouter><Cashier /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button",{name:"Encerrar com senha"}));
    fireEvent.change(screen.getByLabelText("Sua senha"),{target:{value:"wrong"}});
    fireEvent.click(screen.getByRole("button",{name:"Confirmar encerramento"}));expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Justificativa da inadimplência"),{target:{value:"Cliente deixou a comanda sem pagar"}});
    mocks.invoke.mockResolvedValueOnce({data:{error:"Senha incorreta"},error:null});
    fireEvent.click(screen.getByRole("button",{name:"Confirmar encerramento"}));
    await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith("Senha incorreta"));expect(screen.getByRole("dialog")).toBeInTheDocument();expect(screen.getByLabelText("Sua senha")).toHaveValue("");
    mocks.invoke.mockResolvedValueOnce({data:{closed:true,unpaidTotal:20},error:null});fireEvent.change(screen.getByLabelText("Sua senha"),{target:{value:"valid"}});fireEvent.click(screen.getByRole("button",{name:"Confirmar encerramento"}));
    await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith("Mesa liberada. Pendência registrada em inadimplência."));expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
