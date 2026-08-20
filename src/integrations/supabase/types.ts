export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      menu_categories: {
        Row: { created_at: string; destination: string; id: string; key: string; label: string; sort_order: number }
        Insert: { created_at?: string; destination?: string; id?: string; key: string; label: string; sort_order?: number }
        Update: { created_at?: string; destination?: string; id?: string; key?: string; label?: string; sort_order?: number }
        Relationships: []
      }
      menu_item_ingredients: {
        Row: { extra_price: number | null; id: string; menu_item_id: string; name: string; removable: boolean; sort_order: number }
        Insert: { extra_price?: number | null; id?: string; menu_item_id: string; name: string; removable?: boolean; sort_order?: number }
        Update: { extra_price?: number | null; id?: string; menu_item_id?: string; name?: string; removable?: boolean; sort_order?: number }
        Relationships: [{ foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"; columns: ["menu_item_id"]; isOneToOne: false; referencedRelation: "menu_items"; referencedColumns: ["id"] }]
      }
      menu_item_variants: {
        Row: { id: string; menu_item_id: string; name: string; sort_order: number }
        Insert: { id?: string; menu_item_id: string; name: string; sort_order?: number }
        Update: { id?: string; menu_item_id?: string; name?: string; sort_order?: number }
        Relationships: [{ foreignKeyName: "menu_item_variants_menu_item_id_fkey"; columns: ["menu_item_id"]; isOneToOne: false; referencedRelation: "menu_items"; referencedColumns: ["id"] }]
      }
      menu_items: {
        Row: { active: boolean; category: string; created_at: string; description: string | null; id: string; image_url: string | null; name: string; price: number; sort_order: number; updated_at: string }
        Insert: { active?: boolean; category: string; created_at?: string; description?: string | null; id: string; image_url?: string | null; name: string; price: number; sort_order?: number; updated_at?: string }
        Update: { active?: boolean; category?: string; created_at?: string; description?: string | null; id?: string; image_url?: string | null; name?: string; price?: number; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      messages: {
        Row: { body: string; created_at: string | null; id: string; metadata: Json | null; sender_id: string | null; thread_id: string | null }
        Insert: { body: string; created_at?: string | null; id?: string; metadata?: Json | null; sender_id?: string | null; thread_id?: string | null }
        Update: { body?: string; created_at?: string | null; id?: string; metadata?: Json | null; sender_id?: string | null; thread_id?: string | null }
        Relationships: [{ foreignKeyName: "messages_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "threads"; referencedColumns: ["id"] }]
      }
      order_items: {
        Row: { claimed_at: string | null; claimed_by: string | null; destination: string; id: string; ingredient_mods: Json | null; menu_item_id: string; name: string; observation: string | null; order_id: string; price: number; quantity: number; ready_quantity: number }
        Insert: { claimed_at?: string | null; claimed_by?: string | null; destination?: string; id?: string; ingredient_mods?: Json | null; menu_item_id: string; name: string; observation?: string | null; order_id: string; price: number; quantity?: number; ready_quantity?: number }
        Update: { claimed_at?: string | null; claimed_by?: string | null; destination?: string; id?: string; ingredient_mods?: Json | null; menu_item_id?: string; name?: string; observation?: string | null; order_id?: string; price?: number; quantity?: number; ready_quantity?: number }
        Relationships: [{ foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] }]
      }
      orders: {
        Row: { client_id: string; id: string; origin: string; placed_at: string; preparing_at: string | null; ready_at: string | null; session_id: string; status: string }
        Insert: { client_id: string; id?: string; origin?: string; placed_at?: string; preparing_at?: string | null; ready_at?: string | null; session_id: string; status?: string }
        Update: { client_id?: string; id?: string; origin?: string; placed_at?: string; preparing_at?: string | null; ready_at?: string | null; session_id?: string; status?: string }
        Relationships: [
          { foreignKeyName: "orders_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "client_balances"; referencedColumns: ["client_id"] },
          { foreignKeyName: "orders_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "session_clients"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "session_balances"; referencedColumns: ["session_id"] },
          { foreignKeyName: "orders_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "sessions"; referencedColumns: ["id"] },
        ]
      }
      payments: {
        Row: { amount: number; client_id: string; created_by: string | null; id: string; method: string; paid_at: string; service_charge: number; session_id: string }
        Insert: { amount: number; client_id: string; created_by?: string | null; id?: string; method?: string; paid_at?: string; service_charge?: number; session_id: string }
        Update: { amount?: number; client_id?: string; created_by?: string | null; id?: string; method?: string; paid_at?: string; service_charge?: number; session_id?: string }
        Relationships: [
          { foreignKeyName: "payments_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "client_balances"; referencedColumns: ["client_id"] },
          { foreignKeyName: "payments_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "session_clients"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "session_balances"; referencedColumns: ["session_id"] },
          { foreignKeyName: "payments_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "sessions"; referencedColumns: ["id"] },
        ]
      }
      production_batch_inputs: {
        Row: { batch_id: string; id: string; quantity_used: number; raw_material_id: string }
        Insert: { batch_id: string; id?: string; quantity_used: number; raw_material_id: string }
        Update: { batch_id?: string; id?: string; quantity_used?: number; raw_material_id?: string }
        Relationships: [
          { foreignKeyName: "production_batch_inputs_batch_id_fkey"; columns: ["batch_id"]; isOneToOne: false; referencedRelation: "production_batches"; referencedColumns: ["id"] },
          { foreignKeyName: "production_batch_inputs_batch_id_fkey"; columns: ["batch_id"]; isOneToOne: false; referencedRelation: "production_labels"; referencedColumns: ["batch_id"] },
          { foreignKeyName: "production_batch_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "daily_production_closing"; referencedColumns: ["raw_material_id"] },
          { foreignKeyName: "production_batch_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "low_stock_alerts"; referencedColumns: ["id"] },
          { foreignKeyName: "production_batch_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "raw_materials"; referencedColumns: ["id"] },
        ]
      }
      production_batches: {
        Row: { batch_code: string | null; created_at: string; expires_at: string | null; id: string; notes: string | null; produced_at: string; produced_by: string | null; quantity_produced: number; recipe_id: string }
        Insert: { batch_code?: string | null; created_at?: string; expires_at?: string | null; id?: string; notes?: string | null; produced_at?: string; produced_by?: string | null; quantity_produced: number; recipe_id: string }
        Update: { batch_code?: string | null; created_at?: string; expires_at?: string | null; id?: string; notes?: string | null; produced_at?: string; produced_by?: string | null; quantity_produced?: number; recipe_id?: string }
        Relationships: [{ foreignKeyName: "production_batches_recipe_id_fkey"; columns: ["recipe_id"]; isOneToOne: false; referencedRelation: "production_recipes"; referencedColumns: ["id"] }]
      }
      production_recipe_inputs: {
        Row: { id: string; quantity: number; raw_material_id: string; recipe_id: string }
        Insert: { id?: string; quantity: number; raw_material_id: string; recipe_id: string }
        Update: { id?: string; quantity?: number; raw_material_id?: string; recipe_id?: string }
        Relationships: [
          { foreignKeyName: "production_recipe_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "daily_production_closing"; referencedColumns: ["raw_material_id"] },
          { foreignKeyName: "production_recipe_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "low_stock_alerts"; referencedColumns: ["id"] },
          { foreignKeyName: "production_recipe_inputs_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "raw_materials"; referencedColumns: ["id"] },
          { foreignKeyName: "production_recipe_inputs_recipe_id_fkey"; columns: ["recipe_id"]; isOneToOne: false; referencedRelation: "production_recipes"; referencedColumns: ["id"] },
        ]
      }
      production_recipes: {
        Row: { active: boolean; created_at: string; id: string; name: string; output_quantity: number; output_raw_material_id: string; shelf_life_days: number | null }
        Insert: { active?: boolean; created_at?: string; id?: string; name: string; output_quantity: number; output_raw_material_id: string; shelf_life_days?: number | null }
        Update: { active?: boolean; created_at?: string; id?: string; name?: string; output_quantity?: number; output_raw_material_id?: string; shelf_life_days?: number | null }
        Relationships: [
          { foreignKeyName: "production_recipes_output_raw_material_id_fkey"; columns: ["output_raw_material_id"]; isOneToOne: false; referencedRelation: "daily_production_closing"; referencedColumns: ["raw_material_id"] },
          { foreignKeyName: "production_recipes_output_raw_material_id_fkey"; columns: ["output_raw_material_id"]; isOneToOne: false; referencedRelation: "low_stock_alerts"; referencedColumns: ["id"] },
          { foreignKeyName: "production_recipes_output_raw_material_id_fkey"; columns: ["output_raw_material_id"]; isOneToOne: false; referencedRelation: "raw_materials"; referencedColumns: ["id"] },
        ]
      }
      profiles: {
        Row: { cpf: string; created_at: string; full_name: string; id: string; updated_at: string; user_id: string }
        Insert: { cpf?: string; created_at?: string; full_name?: string; id?: string; updated_at?: string; user_id: string }
        Update: { cpf?: string; created_at?: string; full_name?: string; id?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      push_subscriptions: {
        Row: { auth: string; created_at: string; endpoint: string; id: string; p256dh: string; user_id: string }
        Insert: { auth: string; created_at?: string; endpoint: string; id?: string; p256dh: string; user_id: string }
        Update: { auth?: string; created_at?: string; endpoint?: string; id?: string; p256dh?: string; user_id?: string }
        Relationships: []
      }
      raw_materials: {
        Row: { active: boolean; average_cost: number; created_at: string; current_stock: number; id: string; is_produced: boolean; min_stock: number; name: string; unit: string; updated_at: string }
        Insert: { active?: boolean; average_cost?: number; created_at?: string; current_stock?: number; id?: string; is_produced?: boolean; min_stock?: number; name: string; unit: string; updated_at?: string }
        Update: { active?: boolean; average_cost?: number; created_at?: string; current_stock?: number; id?: string; is_produced?: boolean; min_stock?: number; name?: string; unit?: string; updated_at?: string }
        Relationships: []
      }
      recipe_items: {
        Row: { id: string; menu_item_id: string; quantity: number; raw_material_id: string }
        Insert: { id?: string; menu_item_id: string; quantity: number; raw_material_id: string }
        Update: { id?: string; menu_item_id?: string; quantity?: number; raw_material_id?: string }
        Relationships: [
          { foreignKeyName: "recipe_items_menu_item_id_fkey"; columns: ["menu_item_id"]; isOneToOne: false; referencedRelation: "menu_items"; referencedColumns: ["id"] },
          { foreignKeyName: "recipe_items_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "daily_production_closing"; referencedColumns: ["raw_material_id"] },
          { foreignKeyName: "recipe_items_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "low_stock_alerts"; referencedColumns: ["id"] },
          { foreignKeyName: "recipe_items_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "raw_materials"; referencedColumns: ["id"] },
        ]
      }
      session_clients: {
        Row: { added_at: string; bairro: string | null; cep: string | null; email: string | null; genero: string | null; id: string; left_at: string | null; name: string; phone: string | null; session_id: string }
        Insert: { added_at?: string; bairro?: string | null; cep?: string | null; email?: string | null; genero?: string | null; id?: string; left_at?: string | null; name: string; phone?: string | null; session_id: string }
        Update: { added_at?: string; bairro?: string | null; cep?: string | null; email?: string | null; genero?: string | null; id?: string; left_at?: string | null; name?: string; phone?: string | null; session_id?: string }
        Relationships: [
          { foreignKeyName: "session_clients_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "session_balances"; referencedColumns: ["session_id"] },
          { foreignKeyName: "session_clients_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "sessions"; referencedColumns: ["id"] },
        ]
      }
      sessions: {
        Row: { created_at: string; created_by: string | null; ended_at: string | null; id: string; started_at: string; status: string; table_number: number; zone: string }
        Insert: { created_at?: string; created_by?: string | null; ended_at?: string | null; id?: string; started_at?: string; status?: string; table_number: number; zone: string }
        Update: { created_at?: string; created_by?: string | null; ended_at?: string | null; id?: string; started_at?: string; status?: string; table_number?: number; zone?: string }
        Relationships: []
      }
      stock_movements: {
        Row: { batch_info: Json | null; created_at: string; created_by: string | null; id: string; quantity: number; raw_material_id: string; reason: string; reference_id: string | null; reference_type: string | null; supplier_id: string | null; type: string; unit_cost: number | null }
        Insert: { batch_info?: Json | null; created_at?: string; created_by?: string | null; id?: string; quantity: number; raw_material_id: string; reason: string; reference_id?: string | null; reference_type?: string | null; supplier_id?: string | null; type: string; unit_cost?: number | null }
        Update: { batch_info?: Json | null; created_at?: string; created_by?: string | null; id?: string; quantity?: number; raw_material_id?: string; reason?: string; reference_id?: string | null; reference_type?: string | null; supplier_id?: string | null; type?: string; unit_cost?: number | null }
        Relationships: [
          { foreignKeyName: "stock_movements_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "daily_production_closing"; referencedColumns: ["raw_material_id"] },
          { foreignKeyName: "stock_movements_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "low_stock_alerts"; referencedColumns: ["id"] },
          { foreignKeyName: "stock_movements_raw_material_id_fkey"; columns: ["raw_material_id"]; isOneToOne: false; referencedRelation: "raw_materials"; referencedColumns: ["id"] },
          { foreignKeyName: "stock_movements_supplier_id_fkey"; columns: ["supplier_id"]; isOneToOne: false; referencedRelation: "suppliers"; referencedColumns: ["id"] },
        ]
      }
      suppliers: {
        Row: { active: boolean; created_at: string; document: string | null; email: string | null; id: string; name: string; phone: string | null }
        Insert: { active?: boolean; created_at?: string; document?: string | null; email?: string | null; id?: string; name: string; phone?: string | null }
        Update: { active?: boolean; created_at?: string; document?: string | null; email?: string | null; id?: string; name?: string; phone?: string | null }
        Relationships: []
      }
      thread_summaries: {
        Row: { created_at: string | null; created_by: string | null; id: string; model: string; summary: string; thread_id: string | null; tokens_used: number | null }
        Insert: { created_at?: string | null; created_by?: string | null; id?: string; model: string; summary: string; thread_id?: string | null; tokens_used?: number | null }
        Update: { created_at?: string | null; created_by?: string | null; id?: string; model?: string; summary?: string; thread_id?: string | null; tokens_used?: number | null }
        Relationships: [{ foreignKeyName: "thread_summaries_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "threads"; referencedColumns: ["id"] }]
      }
      threads: {
        Row: { created_at: string | null; created_by: string | null; id: string; title: string | null }
        Insert: { created_at?: string | null; created_by?: string | null; id?: string; title?: string | null }
        Update: { created_at?: string | null; created_by?: string | null; id?: string; title?: string | null }
        Relationships: []
      }
      user_roles: {
        Row: { id: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Insert: { id?: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Update: { id?: string; role?: Database["public"]["Enums"]["app_role"]; user_id?: string }
        Relationships: []
      }
    }
    Views: {
      client_balances: {
        Row: { client_id: string | null; name: string | null; saldo_restante: number | null; session_id: string | null; total_consumido: number | null; total_pago: number | null }
        Relationships: [
          { foreignKeyName: "session_clients_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "session_balances"; referencedColumns: ["session_id"] },
          { foreignKeyName: "session_clients_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "sessions"; referencedColumns: ["id"] },
        ]
      }
      daily_production_closing: {
        Row: { data: string | null; product_name: string | null; raw_material_id: string | null; saldo_atual: number | null; total_perda: number | null; total_produzido: number | null; total_vendido: number | null; unit: string | null }
        Relationships: []
      }
      low_stock_alerts: {
        Row: { current_stock: number | null; deficit: number | null; id: string | null; min_stock: number | null; name: string | null; unit: string | null }
        Insert: { current_stock?: number | null; deficit?: never; id?: string | null; min_stock?: number | null; name?: string | null; unit?: string | null }
        Update: { current_stock?: number | null; deficit?: never; id?: string | null; min_stock?: number | null; name?: string | null; unit?: string | null }
        Relationships: []
      }
      production_labels: {
        Row: { batch_code: string | null; batch_id: string | null; expires_at: string | null; produced_at: string | null; product_name: string | null; quantity_produced: number | null; status_validade: string | null; unit: string | null }
        Relationships: []
      }
      session_balances: {
        Row: { saldo_restante: number | null; session_id: string | null; status: string | null; table_number: number | null; total_consumido: number | null; total_pago: number | null; total_servico: number | null }
        Relationships: []
      }
    }
    Functions: {
      current_user_id: { Args: never; Returns: string }
      has_role: { Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "attendant" | "kitchen"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "attendant", "kitchen"],
    },
  },
} as const
