import type { LucideIcon } from "lucide-react";
import { Sandwich, Pizza, CookingPot, Coffee, CupSoda, IceCreamCone, Salad, Soup, CakeSlice, Utensils, Wine, Fish, Beef, Cookie, PlusCircle, Package, Beer, Croissant, Flame, GlassWater, Popcorn, Apple, Drumstick, EggFried, Milk, Martini, Citrus, Cherry, Grape, Candy, Donut, Dessert, IceCreamBowl, Wheat, Carrot, Banana, Popsicle, Ham, Egg, Cake, Vegan, Leaf, Baby, Gift, Percent, Star, Sun, Moon, ChefHat, UtensilsCrossed, Snowflake, Sparkles, Heart, Boxes, Nut } from "lucide-react";

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
  // Ampliação: mais tipos de cardápio, com desenho que corresponde ao nome.
  { name: "drumstick", label: "Frango", Icon: Drumstick },
  { name: "ham", label: "Frios", Icon: Ham },
  { name: "egg-fried", label: "Café da manhã", Icon: EggFried },
  { name: "egg", label: "Ovos", Icon: Egg },
  { name: "wheat", label: "Massas", Icon: Wheat },
  { name: "utensils-crossed", label: "Pratos", Icon: UtensilsCrossed },
  { name: "chef-hat", label: "Especiais", Icon: ChefHat },
  { name: "sun", label: "Almoço", Icon: Sun },
  { name: "moon", label: "Jantar", Icon: Moon },
  { name: "carrot", label: "Vegetariano", Icon: Carrot },
  { name: "vegan", label: "Vegano", Icon: Vegan },
  { name: "leaf", label: "Naturais", Icon: Leaf },
  { name: "nut", label: "Castanhas", Icon: Nut },
  { name: "martini", label: "Coquetéis", Icon: Martini },
  { name: "citrus", label: "Sucos", Icon: Citrus },
  { name: "milk", label: "Shakes", Icon: Milk },
  { name: "snowflake", label: "Gelados", Icon: Snowflake },
  { name: "ice-cream-bowl", label: "Açaí", Icon: IceCreamBowl },
  { name: "popsicle", label: "Picolés", Icon: Popsicle },
  { name: "dessert", label: "Sobremesas", Icon: Dessert },
  { name: "cake", label: "Tortas", Icon: Cake },
  { name: "donut", label: "Donuts", Icon: Donut },
  { name: "candy", label: "Balas", Icon: Candy },
  { name: "cherry", label: "Cerejas", Icon: Cherry },
  { name: "grape", label: "Vinhos", Icon: Grape },
  { name: "banana", label: "Bananas", Icon: Banana },
  { name: "baby", label: "Kids", Icon: Baby },
  { name: "gift", label: "Combos", Icon: Gift },
  { name: "boxes", label: "Kits", Icon: Boxes },
  { name: "percent", label: "Promoções", Icon: Percent },
  { name: "star", label: "Destaques", Icon: Star },
  { name: "sparkles", label: "Novidades", Icon: Sparkles },
  { name: "heart", label: "Favoritos", Icon: Heart },
  { name: "package", label: "Outros", Icon: Package },
];

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const suggestCategoryIcon = (value: string): string => {
  const text = normalize(value);
  // Mais específico primeiro (ex.: "suco" antes de "bebida", "açaí" antes de "sobremesa").
  const rules: [RegExp, string][] = [
    [/combo/, "gift"], [/promo|oferta/, "percent"], [/kid|infantil|crianca/, "baby"], [/kit/, "boxes"],
    [/destaque|mais vendid/, "star"], [/novidade|lancamento/, "sparkles"], [/favorit/, "heart"],
    [/acai/, "ice-cream-bowl"], [/picole/, "popsicle"], [/sorvete|gelato/, "ice-cream-cone"], [/gelad|frozen/, "snowflake"],
    [/milk ?shake|shake|vitamina/, "milk"], [/suco|limonada/, "citrus"], [/cerveja|chopp/, "beer"],
    [/vinho/, "grape"], [/drink|coquetel|caipirinha|gin/, "martini"], [/agua/, "glass-water"],
    [/cafe da manha|breakfast/, "egg-fried"], [/cafe|cappuccino|espresso/, "coffee"],
    [/bebida|refrigerante|refri/, "cup-soda"],
    [/hamburg|burger|lanche|sanduich|sandu/, "sandwich"], [/pizza/, "pizza"],
    [/frango|chicken|asa|coxa/, "drumstick"], [/peixe|frutos? do mar|camarao|sushi/, "fish"],
    [/churrasco|grelhad|brasa/, "flame"], [/carne|bife|picanha/, "beef"], [/frios|presunto|embutid/, "ham"],
    [/massa|macarr|lasanha|risoto/, "wheat"], [/prato|executivo|refei/, "utensils-crossed"],
    [/almoco/, "sun"], [/jantar/, "moon"], [/especia|chef/, "chef-hat"],
    [/vegan/, "vegan"], [/vegetarian|legume/, "carrot"], [/natural|fit|light/, "leaf"],
    [/salada/, "salad"], [/sopa|caldo/, "soup"], [/ovo/, "egg"],
    [/entrada|porc|acompanh|batata|frit/, "cooking-pot"], [/petisco|pipoca|tira.?gosto/, "popcorn"],
    [/pao|padaria|salgad|croissant/, "croissant"],
    [/sobremesa/, "dessert"], [/bolo/, "cake-slice"], [/torta/, "cake"], [/donut|rosquinha/, "donut"],
    [/bala|doce|confeit|brigadeiro|cookie/, "cookie"], [/fruta/, "apple"], [/castanha|nozes/, "nut"],
    [/extra|adicion|complement|molho/, "plus-circle"],
  ];
  for (const [re, icon] of rules) if (re.test(text)) return icon;
  return "utensils";
};
export const getCategoryIcon = (name?: string | null, label = ""): LucideIcon =>
  CATEGORY_ICON_OPTIONS.find((option) => option.name === name)?.Icon ??
  CATEGORY_ICON_OPTIONS.find((option) => option.name === suggestCategoryIcon(label))?.Icon ??
  Package;

export const CATEGORY_COLORS = ["#F58A10", "#39A874", "#428DE0", "#9868DE", "#D65C51"] as const;
export const safeCategoryColor = (value?: string | null): string =>
  value && CATEGORY_COLORS.includes(value as typeof CATEGORY_COLORS[number]) ? value : "#F58A10";
