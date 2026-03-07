export interface Ingredient {
  name: string;
  removable: boolean;
  extraPrice?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: MenuCategory;
  description?: string;
  ingredients?: Ingredient[];
  /** For drink sub-options (e.g. flavors) shown as read-only info */
  variants?: string[];
}

export type MenuCategory = "burgers" | "sides" | "drinks" | "desserts";

/** Categories that go to the kitchen display (KDS) */
export const kitchenCategories: MenuCategory[] = ["burgers", "sides"];

/** Categories handled by the bar / waiter */
export const barCategories: MenuCategory[] = ["drinks", "desserts"];

export const categoryLabels: Record<MenuCategory, string> = {
  burgers: "Hambúrgueres",
  sides: "Entradas",
  drinks: "Bebidas",
  desserts: "Extras",
};

/** Check if a menu item ID belongs to the kitchen */
export const isKitchenItem = (menuItemId: string): boolean => {
  const item = menuItems.find((m) => m.id === menuItemId);
  return item ? kitchenCategories.includes(item.category) : true;
};

/** Check if a menu item ID belongs to the bar */
export const isBarItem = (menuItemId: string): boolean => {
  const item = menuItems.find((m) => m.id === menuItemId);
  return item ? barCategories.includes(item.category) : false;
};

export const menuItems: MenuItem[] = [
  // ── Burgers ──
  {
    id: "b1", name: "Cheese Burguer", price: 25.99, category: "burgers",
    description: "Blend de carnes 160g, duplo queijo prato, confitnese (maionese da casa, produzida com alho confitado) no pão prime bun selado.",
    ingredients: [
      { name: "Blend de carnes 160g", removable: false },
      { name: "Queijo prato duplo", removable: true, extraPrice: 5.0 },
      { name: "Confitnese", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },
  {
    id: "b2", name: "Crispy Burguer", price: 28.99, category: "burgers",
    description: "Blend de carnes 160g, duplo queijo cheddar, bacon crispy, tomate confitado, cebola crispy, picles agridoce de pepino, confitnese no pão prime bun selado.",
    ingredients: [
      { name: "Blend de carnes 160g", removable: false },
      { name: "Queijo cheddar duplo", removable: true, extraPrice: 5.0 },
      { name: "Bacon crispy", removable: true, extraPrice: 6.0 },
      { name: "Tomate confitado", removable: true, extraPrice: 2.5 },
      { name: "Cebola crispy", removable: true, extraPrice: 3.0 },
      { name: "Picles agridoce de pepino", removable: true, extraPrice: 2.0 },
      { name: "Confitnese", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },
  {
    id: "b3", name: "Confit Burguer", price: 35.99, category: "burgers",
    description: "Blend de carnes 160g, queijo coalho chapeado, bacon caramelizado na cerveja escura e melaço de cana, picles de cebola roxa, tomate confitado, honeynese no pão prime bun selado.",
    ingredients: [
      { name: "Blend de carnes 160g", removable: false },
      { name: "Queijo coalho chapeado", removable: true, extraPrice: 6.0 },
      { name: "Bacon caramelizado", removable: true, extraPrice: 7.0 },
      { name: "Picles de cebola roxa", removable: true, extraPrice: 2.0 },
      { name: "Tomate confitado", removable: true, extraPrice: 2.5 },
      { name: "Honeynese", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },
  {
    id: "b4", name: "Piggy Burguer", price: 30.99, category: "burgers",
    description: "Burguer de costelinha suína, duplo queijo cheddar, picles de pepino agridoce, palha de batata doce, barbecue artesanal com hortelã no pão prime bun selado.",
    ingredients: [
      { name: "Costelinha suína", removable: false },
      { name: "Queijo cheddar duplo", removable: true, extraPrice: 5.0 },
      { name: "Picles de pepino agridoce", removable: true, extraPrice: 2.0 },
      { name: "Palha de batata doce", removable: true, extraPrice: 4.0 },
      { name: "Barbecue de hortelã", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },
  {
    id: "b5", name: "Gorgon Burguer", price: 39.99, category: "burgers",
    description: "Blend de carnes 160g, queijo gorgonzola, bacon caramelizado na cerveja escura com melaço de cana, relish de tomate cereja, rúcula, honeynese no pão prime bun selado.",
    ingredients: [
      { name: "Blend de carnes 160g", removable: false },
      { name: "Queijo gorgonzola", removable: true, extraPrice: 7.0 },
      { name: "Bacon caramelizado", removable: true, extraPrice: 7.0 },
      { name: "Relish de tomate cereja", removable: true, extraPrice: 2.5 },
      { name: "Rúcula", removable: true, extraPrice: 2.0 },
      { name: "Honeynese", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },
  {
    id: "b6", name: "Frangolino Burguer", price: 28.99, category: "burgers",
    description: "Blend de frango com bacon 170g, duplo queijo prato, picles de cebola roxa, relish de tomate cereja, couve crispy e confitnese no pão prime.",
    ingredients: [
      { name: "Blend de frango c/ bacon 170g", removable: false },
      { name: "Queijo prato duplo", removable: true, extraPrice: 5.0 },
      { name: "Picles de cebola roxa", removable: true, extraPrice: 2.0 },
      { name: "Relish de tomate cereja", removable: true, extraPrice: 2.5 },
      { name: "Couve crispy", removable: true, extraPrice: 3.5 },
      { name: "Confitnese", removable: true, extraPrice: 3.0 },
      { name: "Pão prime", removable: false },
    ],
  },
  {
    id: "b7", name: "Cerrado Burguer", price: 29.99, category: "burgers",
    description: "Blend de lentilha e berinjela, queijo prato, tomate confit, picles de pepino agridoce, barbecue de hortelã no pão prime bun selado.",
    ingredients: [
      { name: "Blend de lentilha e berinjela", removable: false },
      { name: "Queijo prato", removable: true, extraPrice: 5.0 },
      { name: "Tomate confit", removable: true, extraPrice: 2.5 },
      { name: "Picles de pepino agridoce", removable: true, extraPrice: 2.0 },
      { name: "Barbecue de hortelã", removable: true, extraPrice: 3.0 },
      { name: "Pão prime bun", removable: false },
    ],
  },

  // ── Entradas ──
  {
    id: "s1", name: "Batata Simples", price: 19.99, category: "sides",
    description: "Batata simples com tempero do cheff.",
    ingredients: [
      { name: "Tempero do cheff", removable: true, extraPrice: 2.0 },
      { name: "Cheddar", removable: false, extraPrice: 5.0 },
      { name: "Bacon bits", removable: false, extraPrice: 6.0 },
    ],
  },
  {
    id: "s2", name: "Croquete de Ossobuco", price: 28.99, category: "sides",
    description: "5 croquetes de ossobuco defumado com cream cheese empanado na panko. Acompanha confitnese. 40g cada croquete.",
    ingredients: [
      { name: "Ossobuco defumado", removable: false },
      { name: "Cream cheese", removable: true, extraPrice: 4.0 },
      { name: "Panko", removable: false },
      { name: "Confitnese", removable: true, extraPrice: 3.0 },
    ],
  },
  {
    id: "s3", name: "Batata Carne Louca", price: 31.99, category: "sides",
    description: "Porção de batata com tempero do chefe, carne louca (carne desfiada com molho de tomate confitado, cebola e especiarias), queijo parmesão, relish de tomate cereja e cebolinha.",
    ingredients: [
      { name: "Carne louca", removable: false },
      { name: "Queijo parmesão", removable: true, extraPrice: 5.0 },
      { name: "Relish de tomate cereja", removable: true, extraPrice: 2.5 },
      { name: "Cebolinha", removable: true, extraPrice: 1.5 },
      { name: "Tempero do chefe", removable: true, extraPrice: 2.0 },
    ],
  },
  {
    id: "s4", name: "Nuggetz", price: 25.99, category: "sides",
    description: "Peito de frango com bacon e provolone, empanados na farinha de rosca. 5 un de 50g. Acompanha barbecue de hortelã.",
    ingredients: [
      { name: "Frango com bacon", removable: false },
      { name: "Provolone", removable: true, extraPrice: 4.0 },
      { name: "Barbecue de hortelã", removable: true, extraPrice: 3.0 },
    ],
  },

  // ── Bebidas ──
  {
    id: "d1", name: "Refrigerante Lata", price: 7.00, category: "drinks",
    variants: ["Coca Cola", "Coca Cola 0", "Guaraná", "Fanta Laranja", "Schweppes", "Guaraná Antarctica", "Guaraná Antarctica 0"],
  },
  {
    id: "d2", name: "Cerveja Heineken", price: 12.00, category: "drinks",
  },
  {
    id: "d3", name: "Cerveja Budweiser", price: 10.00, category: "drinks",
  },
  {
    id: "d4", name: "Cerveja Spaten", price: 10.00, category: "drinks",
  },
  {
    id: "d5", name: "Suco Natural Sucopira", price: 10.00, category: "drinks",
    variants: ["Morango com amora", "Laranja", "Cajá com maracujá", "Uva"],
  },
  {
    id: "d6", name: "Água 500ml", price: 3.50, category: "drinks",
    variants: ["Água com gás", "Água sem gás"],
  },

  // ── Extras ──
  {
    id: "e1", name: "Transforme em Trio", price: 15.00, category: "desserts",
    description: "Adicione batata + refrigerante ao seu burguer.",
  },
  {
    id: "e2", name: "Molho Extra", price: 3.00, category: "desserts",
    description: "Porção extra de molho à escolha.",
    variants: ["Confitnese", "Honeynese", "Barbecue de hortelã"],
  },
];
