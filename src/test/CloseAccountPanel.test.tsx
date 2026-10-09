import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type {HTMLAttributes,ReactNode} from "react";
const mocks=vi.hoisted(()=>({payments:[] as {id:string;client_id:string;amount:number;service_charge:number;method:string;paid_at:string}[],paymentError:false,insert:vi.fn(),error:vi.fn()}));
vi.mock("@/hooks/useCurrentBusinessUnit",()=>({useCurrentBusinessUnit:()=>({businessUnitId:"unit"})}));
vi.mock("@/utils/thermal-print",()=>({buildClientBillReceipt:vi.fn(),buildTableBillReceipt:vi.fn(),printReceipt:vi.fn()}));
vi.mock("@/components/ReceiptPreviewModal",()=>({default:()=>null}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:mocks.error}}));
vi.mock("framer-motion",()=>({motion:{div:({children,className}:HTMLAttributes<HTMLDivElement>&{children:ReactNode})=><div className={className}>{children}</div>},AnimatePresence:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{
  auth:{getUser:async()=>({data:{user:{id:"attendant"}}})},
  from:()=>{const query={select:()=>query,eq:()=>query,insert:mocks.insert,then:(resolve:(data:unknown)=>unknown)=>Promise.resolve({data:mocks.paymentError ? null : mocks.payments,error:mocks.paymentError ? {message:"Offline"} : null}).then(resolve)};return query;},
  channel:()=>{const channel={on:()=>channel,subscribe:()=>channel};return channel;},removeChannel:vi.fn(),
}}));
import CloseAccountPanel from "@/components/CloseAccountPanel";
const props={tableId:1,sessionId:"session",clients:[{id:"client",name:"João Cliente",addedAt:new Date()}],orders:[{clientId:"client",cart:[],orders:[{id:"order",status:"delivered" as const,placedAt:new Date(),items:[{menuItemId:"burger",name:"Hambúrguer",price:20,quantity:1}]}]}]};
afterEach(cleanup);beforeEach(()=>{mocks.payments=[];mocks.paymentError=false;mocks.insert.mockReset();});
describe("attendant payment and request flow",()=>{
  it("requests cashier approval without asking an attendant password or freeing the table",async()=>{
    const request=vi.fn().mockResolvedValue(true),back=vi.fn();render(<CloseAccountPanel {...props} onRequestCloseSession={request} onBack={back} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Solicitar encerramento"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button",{name:"Solicitar encerramento"}));
    await waitFor(()=>expect(request).toHaveBeenCalledWith(false));expect(back).toHaveBeenCalledOnce();expect(screen.queryByPlaceholderText("Sua senha")).not.toBeInTheDocument();
  });
  it("keeps the panel open when the server fails to register the request",async()=>{
    const back=vi.fn();render(<CloseAccountPanel {...props} onRequestCloseSession={vi.fn().mockResolvedValue(false)} onBack={back} />);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Solicitar encerramento"})).not.toBeDisabled());fireEvent.click(screen.getByRole("button",{name:"Solicitar encerramento"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Solicitar encerramento"})).not.toBeDisabled());expect(back).not.toHaveBeenCalled();
  });
  it("records only the remaining service charge instead of adding another principal payment",async()=>{
    mocks.payments=[{id:"paid",client_id:"client",amount:20,service_charge:0,method:"pix",paid_at:new Date().toISOString()}];
    mocks.insert.mockImplementation(async(row)=>{mocks.payments.push({...row,id:"new",paid_at:new Date().toISOString()});return {error:null};});
    render(<CloseAccountPanel {...props} serviceChargeEnabled onRequestCloseSession={vi.fn()} onBack={vi.fn()} />);
    await waitFor(()=>expect(screen.queryByText("Atualizando pagamentos...")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:"Pagar"}));
    fireEvent.click(screen.getByRole("button",{name:/Pagar R\$.*2,00/}));
    await waitFor(()=>expect(mocks.insert).toHaveBeenCalled());expect(mocks.insert.mock.calls[0][0]).toMatchObject({amount:0,service_charge:2,session_id:"session",business_unit_id:"unit"});
  });
  it("does not show a failed payment lookup as a settled account",async()=>{
    mocks.paymentError=true;render(<CloseAccountPanel {...props} onRequestCloseSession={vi.fn()} onBack={vi.fn()} />);
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("conferir os pagamentos"));expect(screen.getByRole("button",{name:"Solicitar encerramento"})).toBeDisabled();
  });
});
