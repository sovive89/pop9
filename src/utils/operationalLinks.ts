export function orderLink(origin:string,unit:string) {
  try {const url=new URL(origin);if(url.protocol!=="https:" || url.username || url.password || url.pathname!=="/" || url.search || url.hash)return "";return `${url.origin}/pedir/${encodeURIComponent(unit)}?origem=whatsapp`;}catch{return "";}
}
export function whatsappLink(phone:string,text="PEDIR") {const normalized=phone.replace(/\D/g,"");return /^\d{8,15}$/.test(normalized) ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}` : "";}
export const pickupLabel = (number:number) => number<0 ? `Retirada #${Math.abs(number)}` : `Mesa ${String(number).padStart(2,"0")}`;
