/** Mesma regra do servidor (publicOrigin): só origem HTTPS pública, sem porta, caminho nem host local/privado. */
export function publicOriginOrEmpty(value:string) {
  try {const url=new URL(value);return url.protocol==="https:" && !url.port && !url.username && !url.password && url.pathname==="/" && !url.search && !url.hash && !/^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(url.hostname) ? url.origin : "";}catch{return "";}
}
export function orderLink(origin:string,unit:string,origem="whatsapp") {
  try {const url=new URL(origin);if(url.protocol!=="https:" || url.username || url.password || url.pathname!=="/" || url.search || url.hash)return "";return `${url.origin}/pedir/${encodeURIComponent(unit)}?origem=${encodeURIComponent(origem)}`;}catch{return "";}
}
export function whatsappLink(phone:string,text="PEDIR") {const normalized=phone.replace(/\D/g,"");return /^\d{8,15}$/.test(normalized) ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}` : "";}
export const pickupLabel = (number:number) => number<0 ? `Retirada #${Math.abs(number)}` : `Mesa ${String(number).padStart(2,"0")}`;
