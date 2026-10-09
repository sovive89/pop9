import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { supabase } from "@/integrations/supabase/client";
export interface DocumentMenuItem {
  id: string; sku: string | null; name: string; description: string; price: number;
  category: string; categoryLabel: string; imageUrl: string | null;
  ingredients: { name: string; removable: boolean; extraPrice: number }[];
  variants: string[];
}
export const useMenuDocuments = () => {
  const { user } = useAuth();
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const [revision, setRevision] = useState(0);
  const scope = `${user?.id}:${businessUnitId}:${revision}`;
  const [state, setState] = useState<{scope:string;items:DocumentMenuItem[];error:boolean}>({scope:"",items:[],error:false});
  useEffect(() => {
    if (!user || !businessUnitId) return;
    let disposed = false;
    const load = async () => {
      const [itemResult, categoryResult] = await Promise.all([
        supabase.from("menu_items").select("id, sku, name, description, price, category, image_url, sort_order, menu_item_ingredients(name, removable, extra_price, sort_order), menu_item_variants(name, sort_order)")
          .eq("business_unit_id",businessUnitId).eq("active",true).eq("status","published").order("sort_order").order("id"),
        supabase.from("menu_categories").select("key, label, sort_order").eq("business_unit_id",businessUnitId).order("sort_order"),
      ]);
      if (itemResult.error || categoryResult.error) throw itemResult.error ?? categoryResult.error;
      const categories = categoryResult.data ?? [];
      const items:DocumentMenuItem[] = (itemResult.data ?? []).map(item=>({
        id:item.id,sku:item.sku,name:item.name,description:item.description ?? "",price:Number(item.price),
        category:item.category,categoryLabel:categories.find(category=>category.key===item.category)?.label ?? item.category,
        imageUrl:item.image_url,
        ingredients:[...item.menu_item_ingredients].sort((a,b)=>a.sort_order-b.sort_order).map(ingredient=>({name:ingredient.name,removable:ingredient.removable,extraPrice:Number(ingredient.extra_price ?? 0)})),
        variants:[...item.menu_item_variants].sort((a,b)=>a.sort_order-b.sort_order).map(variant=>variant.name),
      })).sort((a,b)=>{
        const position=(key:string)=>categories.findIndex(category=>category.key===key);
        return (position(a.category)<0 ? categories.length : position(a.category))-(position(b.category)<0 ? categories.length : position(b.category));
      });
      if(!disposed)setState({scope,items,error:false});
    };
    void load().catch(()=>{if(!disposed)setState({scope,items:[],error:true});});
    return ()=>{disposed=true;};
  },[businessUnitId,scope,user]);
  const visible=Boolean(user && businessUnitId) && state.scope===scope;
  return {items:visible ? state.items : [],loading:Boolean(user && businessUnitId) && !visible,error:visible && state.error,
    scope, unitName:units.find(unit=>unit.id===businessUnitId)?.name ?? "",businessUnitId,reload:()=>setRevision(n=>n+1)};
};
