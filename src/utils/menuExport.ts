import type { DocumentMenuItem } from "@/hooks/useMenuDocuments";
import { buildCsv, safeFileName } from "@/utils/fileExport";
import { formatCurrency } from "@/utils/orders";
export type MenuExportTarget = "ifood" | "99food";
export interface MenuImage { itemId:string; fileName:string; bytes:Uint8Array; mime:string }
export const menuCsv = (items:DocumentMenuItem[],images:MenuImage[]=[]) => buildCsv([
  ["Código","SKU","Categoria","Nome","Descrição","Preço (BRL)","Variações","Ingredientes removíveis","Adicionais e preços","URL da imagem","Arquivo da imagem"],
  ...items.map(item=>[item.id,item.sku,item.categoryLabel,item.name,item.description,item.price.toFixed(2),item.variants.join(" | "),item.ingredients.filter(ingredient=>ingredient.removable).map(ingredient=>ingredient.name).join(" | "),item.ingredients.filter(ingredient=>ingredient.extraPrice>0).map(ingredient=>`${ingredient.name}: ${ingredient.extraPrice.toFixed(2)}`).join(" | "),item.imageUrl,images.find(image=>image.itemId===item.id)?.fileName]),
]);
export const fetchMenuImage = async (item:DocumentMenuItem,index:number):Promise<MenuImage> => {
  if(!item.imageUrl)throw new Error("Imagem não cadastrada");
  const url=new URL(item.imageUrl,window.location.origin);
  if(!["https:","http:"].includes(url.protocol))throw new Error("Endereço de imagem inválido");
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(url.href,{credentials:"omit",signal:controller.signal});
    if(!response.ok)throw new Error("Imagem indisponível");
    const mime=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const extension:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if(!extension[mime])throw new Error("Formato de imagem não suportado; use JPG, PNG ou WebP");
    if(Number(response.headers.get("content-length"))>5*1024*1024)throw new Error("Imagem maior que 5 MB");
    const blob=await response.blob();
    if(blob.size>5*1024*1024)throw new Error("Imagem maior que 5 MB");
    return {itemId:item.id,fileName:`imagens/${String(index+1).padStart(3,"0")}-${safeFileName(item.name)}.${extension[mime]}`,bytes:new Uint8Array(await blob.arrayBuffer()),mime};
  } finally {window.clearTimeout(timeout);}
};
export const collectMenuImages = async (items:DocumentMenuItem[],onProgress?:(completed:number,total:number)=>void) => {
  const images:MenuImage[]=[];const missing:string[]=[];
  let completed=0;let totalBytes=0;
  for(let start=0;start<items.length;start+=4){
    const results=await Promise.allSettled(items.slice(start,start+4).map((item,index)=>fetchMenuImage(item,start+index)));
    results.forEach((result,index)=>{
      const item=items[start+index];
      if(result.status==="fulfilled" && totalBytes+result.value.bytes.length<=100*1024*1024){images.push(result.value);totalBytes+=result.value.bytes.length;}
      else missing.push(`${item.name}: ${result.status==="rejected" ? result.reason instanceof Error ? result.reason.message : "Falha ao baixar" : "Limite de 100 MB do pacote atingido"}`);
      completed++;onProgress?.(completed,items.length);
    });
  }
  return {images,missing};
};
export const buildMenuPdf = async (unitName:string,items:DocumentMenuItem[],images:MenuImage[]=[],onImageFailure?:(name:string)=>void) => {
  const {jsPDF}=await import("jspdf");
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  const width=180;let y=20;let category="";
  const newPage=()=>{pdf.addPage();y=20;};
  const line=(text:string,size=10,bold=false)=>{
    pdf.setFont("helvetica",bold ? "bold" : "normal");pdf.setFontSize(size);
    for(const part of pdf.splitTextToSize(text,width) as string[]){if(y>275)newPage();pdf.text(part,15,y);y+=size*0.45+1;}
  };
  line(unitName || "Cardápio",20,true);line("Cardápio do estabelecimento",11);y+=5;
  for(const item of items){
    if(y>235)newPage();
    if(item.categoryLabel!==category){category=item.categoryLabel;line(category,14,true);y+=3;}
    const image=images.find(image=>image.itemId===item.id);
    let imageHeight=0;
    if(image){try{const props=pdf.getImageProperties(image.bytes);imageHeight=Math.min(25,25*props.height/props.width);pdf.addImage(image.bytes, image.mime==="image/png"?"PNG":image.mime==="image/webp"?"WEBP":"JPEG",170,y-3,25,imageHeight,undefined,"FAST");}catch{onImageFailure?.(`${item.name}: imagem baixada, mas não foi possível incluí-la no PDF`);}}
    const startY=y;
    pdf.setFont("helvetica","bold");pdf.setFontSize(12);
    const nameLines=pdf.splitTextToSize(`${item.name} — ${formatCurrency(item.price)}`,image ? 150 : width) as string[];
    for(const part of nameLines){if(y>275)newPage();pdf.text(part,15,y);y+=6;}
    y=Math.max(y,startY+imageHeight+2);
    if(item.description)line(item.description);
    if(item.variants.length)line(`Variações: ${item.variants.join(", ")}`);
    const removable=item.ingredients.filter(ingredient=>ingredient.removable);
    if(removable.length)line(`Ingredientes removíveis: ${removable.map(ingredient=>ingredient.name).join(", ")}`);
    const extras=item.ingredients.filter(ingredient=>ingredient.extraPrice>0);
    if(extras.length)line(`Adicionais: ${extras.map(ingredient=>`${ingredient.name} (+${formatCurrency(ingredient.extraPrice)})`).join(", ")}`);
    y+=5;
  }
  for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.text(`${unitName} · Página ${page}/${pdf.getNumberOfPages()}`,15,290);}
  return new Uint8Array(pdf.output("arraybuffer"));
};
export const exportInstructions = (target:MenuExportTarget,missing:string[]) => {
  const platform=target==="ifood" ? "iFood" : "99Food";
  const specific=target==="ifood"
    ? "No Portal do Parceiro, abra Cardápio e use a digitalização por PDF/imagem, quando disponível na sua conta. Envie cardapio.pdf e revise nomes, descrições, preços, categorias, complementos e adicionais antes de publicar. As fotos separadas devem ser vinculadas aos produtos no portal.\nReferência oficial: https://blog-parceiros.ifood.com.br/files/relatorio_ifood_para_restaurantes.pdf (Digitalização do cardápio)."
    : "No aplicativo/portal 99Food, abra Cardápio > Cardápio da Loja > Enviar > Cardápio do estabelecimento. Envie cardapio.pdf. A 99Food aceita PDF, fotos ou QR code do menu. Os preços devem corresponder ao cardápio do estabelecimento; revise os itens e anexe suas fotos antes de publicar.\nReferência oficial: https://99app.com/99food/restaurantes/guias/como-construir-o-seu-cardapio/";
  return `Pacote de cardápio para ${platform}\n\nExtraia o ZIP antes de enviar os arquivos.\n\n${specific}\n\nArquivos:\n- cardapio.pdf: cardápio com categorias, preços, descrições e opções cadastradas.\n- cardapio.csv: planilha de apoio ao cadastro/revisão; não é um modelo oficial de importação direta.\n- imagens/: imagens originais dos itens quando disponíveis.\n- imagens.csv: relação entre cada item, arquivo e URL original.\n\nSomente itens ativos e publicados da unidade selecionada são exportados. Nenhum produto é publicado automaticamente nas plataformas.\n\n${missing.length ? `Observações sobre imagens:\n${missing.join("\n")}` : "Todas as imagens cadastradas foram incluídas."}\n`;
};
export const buildMenuPackage = async (target:MenuExportTarget,unitName:string,items:DocumentMenuItem[],images:MenuImage[],missing:string[]) => {
  const [{zipSync,strToU8},pdf]=await Promise.all([import("fflate"),buildMenuPdf(unitName,items,images,message=>missing.push(message))]);
  const files:Record<string,Uint8Array>={"cardapio.pdf":pdf,"cardapio.csv":strToU8(menuCsv(items,images)),"LEIA-ME.txt":strToU8(exportInstructions(target,missing)),
    "imagens.csv":strToU8(buildCsv([["Código","Item","Arquivo","URL original"],...items.map(item=>[item.id,item.name,images.find(image=>image.itemId===item.id)?.fileName,item.imageUrl])]))};
  for(const image of images)files[image.fileName]=image.bytes;
  return zipSync(files,{level:1});
};
