import {publicPost,type PublicPostOptions} from "@/lib/publicApi";

/**
 * Chamada pública à função public-order (cardápio, status, envio do pedido).
 * Repete sozinha em falha de rede, tempo esgotado e 5xx: o envio é idempotente pelo token do cliente
 * (repetir devolve o mesmo pedido), então reenviar não duplica.
 */
export function publicOrderApi<T = any>(body:Record<string,unknown>,options?:PublicPostOptions):Promise<T>{
  return publicPost<T>("public-order",body,options);
}
