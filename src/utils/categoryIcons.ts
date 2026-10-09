import type { LucideIcon } from "lucide-react";
import { Sandwich, Pizza, CookingPot, Coffee, CupSoda, IceCreamCone, Salad, Soup, CakeSlice, Utensils, Wine, Fish, Beef, Cookie, PlusCircle, Package, Beer, Croissant, Flame, GlassWater, Popcorn, Apple } from "lucide-react";

export const CATEGORY_ICON_OPTIONS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "sandwich", label: "Lanches", Icon: Sandwich },
  { name: "pizza", label: "Pizzas", Icon: Pizza },
  { name: "cooking-pot", label: "Porções", Icon: CookingPot },
  { name: "coffee", label: "Cafés", Icon: Coffee },
  { name: "cup-soda", label: "Refrigerantes", Icon: CupSoda },
  { name: "ice-cream-cone", label: "Sorvetes", Icon: IceCreamCone },
  { name: "salad", label: "Saladas", Icon: Salad },
  { name: "soup", label: "Sopas", Icon: Soup },
  { name: "cake-slice", label: "Bolos", Icon: CakeSlice },
  { name: "utensils", label: "Refeições", Icon: Utensils },
  { name: "wine", label: "Drinks", Icon: Wine },
  { name: "fish", label: "Peixes", Icon: Fish },
  { name: "beef", label: "Carnes", Icon: Beef },
  { name: "cookie", label: "Doces", Icon: Cookie },
  { name: "plus-circle", label: "Extras", Icon: PlusCircle },
  { name: "beer", label: "Cervejas", Icon: Beer },
  { name: "croissant", label: "Padaria", Icon: Croissant },
  { name: "flame", label: "Grelhados", Icon: Flame },
  { name: "glass-water", label: "Água", Icon: GlassWater },
  { name: "popcorn", label: "Petiscos", Icon: Popcorn },
  { name: "apple", label: "Frutas", Icon: Apple },
  { name: "package", label: "Outros", Icon: Package },
];

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const suggestCategoryIcon = (value: string): string => {
  const text = normalize(value);
  if (/hamburg|burger|lanche|sanduich/.test(text)) return "sandwich";
  if (/pizza/.test(text)) return "pizza";
  if (/entrada|porc|acompanh|batata|frit/.test(text)) return "cooking-pot";
  if (/cerveja|chopp/.test(text)) return "beer";
  if (/drink|coquetel|vinho/.test(text)) return "wine";
  if (/bebida|refrigerante|suco/.test(text)) return "cup-soda";
  if (/sobremesa|sorvete/.test(text)) return "ice-cream-cone";
  if (/doce|cookie/.test(text)) return "cookie";
  if (/salada|veget/.test(text)) return "salad";
  if (/cafe/.test(text)) return "coffee";
  if (/extra|adicion|complement|molho/.test(text)) return "plus-circle";
  if (/peixe|fruto.*mar/.test(text)) return "fish";
  if (/carne|churrasco/.test(text)) return "beef";
  if (/petisco|pipoca/.test(text)) return "popcorn";
  if (/bolo|torta/.test(text)) return "cake-slice";
  return "utensils";
};
export const getCategoryIcon = (name?: string | null, label = ""): LucideIcon =>
  CATEGORY_ICON_OPTIONS.find((option) => option.name === name)?.Icon ??
  CATEGORY_ICON_OPTIONS.find((option) => option.name === suggestCategoryIcon(label))?.Icon ??
  Package;

export const CATEGORY_COLORS = ["#F58A10", "#39A874", "#428DE0", "#9868DE", "#D65C51"] as const;
export const safeCategoryColor = (value?: string | null): string =>
  value && CATEGORY_COLORS.includes(value as typeof CATEGORY_COLORS[number]) ? value : "#F58A10";
