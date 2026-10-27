// @vitest-environment node
import {existsSync,readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

// Guarda da instalação do PWA. Antes, `public/manifest.json` apontava para `icon-192.png`/`icon-512.png` e o
// <link rel="apple-touch-icon"> para `/icon-192.png`: nenhum desses arquivos existe, então o ícone quebrava
// e havia três manifests concorrentes. Aqui qualquer referência a arquivo inexistente derruba o CI.
const read=(path:string)=>readFileSync(path,"utf8");
const publicPath=(url:string)=>`public/${url.replace(/^\/+/,"").split("?")[0]}`;
const GENERATED_AT_BUILD=new Set(["manifest.webmanifest"]); // criado pelo VitePWA, não existe em public/

function pngSize(path:string){
  const bytes=readFileSync(path);
  // Cabeçalho PNG: 8 bytes de assinatura, depois o chunk IHDR com largura e altura (4 bytes cada, big-endian).
  expect(bytes.subarray(1,4).toString("ascii"),`${path} não é PNG`).toBe("PNG");
  return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}

// Comentários HTML são ignorados: o index.html explica o manifest num comentário que cita a própria tag.
const html=read("index.html").replace(/<!--[\s\S]*?-->/g,"");
const links=[...html.matchAll(/<link\s+([^>]*?)\/?>/gi)].map(match=>{
  const attr=(name:string)=>new RegExp(`${name}\\s*=\\s*"([^"]*)"`,"i").exec(match[1])?.[1];
  return {rel:attr("rel")?.toLowerCase(),href:attr("href")};
});

describe("PWA: arquivos referenciados existem",()=>{
  it("o index.html não declara manifest próprio (o VitePWA injeta um só, e /pedir troca por unidade)",()=>{
    expect(links.filter(link=>link.rel==="manifest")).toEqual([]);
    expect(existsSync("public/manifest.json"),"public/manifest.json duplicaria o manifest do VitePWA").toBe(false);
  });

  it("ícones e apple-touch-icon do index.html existem em public/",()=>{
    const icons=links.filter(link=>link.rel && /(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/.test(link.rel) && link.href?.startsWith("/"));
    expect(icons.length).toBeGreaterThan(0);
    const missing=icons.filter(link=>!existsSync(publicPath(link.href!))).map(link=>link.href);
    expect(missing).toEqual([]);
  });

  it("includeAssets e ícones do manifest do VitePWA existem em public/",()=>{
    const config=read("vite.config.ts");
    const include=/includeAssets:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    const assets=[...include.matchAll(/"([^"]+)"/g)].map(match=>match[1]);
    const manifestIcons=[...config.matchAll(/src:\s*"([^"]+)"/g)].map(match=>match[1]);
    expect(assets.length).toBeGreaterThan(0);
    expect(manifestIcons.length).toBeGreaterThan(0);
    const missing=[...assets,...manifestIcons].filter(file=>!GENERATED_AT_BUILD.has(file) && !existsSync(publicPath(file)));
    expect(missing).toEqual([]);
  });

  it("ícones do manifest dinâmico por loja (Edge Function public-order) existem em public/",()=>{
    const source=read("supabase/functions/public-order/index.ts");
    const icons=[...source.matchAll(/\$\{origin\}\/([A-Za-z0-9_.-]+\.png)/g)].map(match=>match[1]);
    expect(icons.length).toBeGreaterThanOrEqual(2);
    expect(icons.filter(file=>!existsSync(publicPath(file)))).toEqual([]);
  });

  it("o tamanho real dos PNGs bate com o declarado (192x192 e 512x512)",()=>{
    expect(pngSize("public/pwa-icon-192.png")).toEqual({width:192,height:192});
    expect(pngSize("public/pwa-icon-512.png")).toEqual({width:512,height:512});
  });
});
