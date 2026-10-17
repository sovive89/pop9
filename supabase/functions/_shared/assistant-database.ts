// Narrow contracts for tables/columns used by these Edge Functions.
// Keep deploy-time types inside supabase/functions; no frontend imports.
export type AssistantDatabase = {
  public: {
    Tables: {
      user_roles: {
        Row: { id: string; user_id: string; business_unit_id: string | null; role: string };
        Insert: { id?: string; user_id: string; business_unit_id?: string | null; role: string };
        Update: { business_unit_id?: string | null; role?: string };
        Relationships: [];
      };
      business_units: {
        Row: { id: string; name: string; active: boolean };
        Insert: { id?: string; name: string; active?: boolean };
        Update: { name?: string; active?: boolean };
        Relationships: [];
      };
      ai_provider_credentials: {
        Row: { business_unit_id: string; provider: string; status: string; encrypted_key: string; iv: string };
        Insert: { business_unit_id: string; provider: string; status?: string; encrypted_key: string; iv: string };
        Update: { status?: string; encrypted_key?: string; iv?: string };
        Relationships: [];
      };
      ai_assistant_usage: {
        Row: { id: string; business_unit_id: string; user_id: string; action: string; model: string; status: string; completed_at: string | null; input_tokens: number | null; output_tokens: number | null };
        Insert: { id: string; business_unit_id: string; user_id: string; action: string; model: string; status?: string; completed_at?: string | null; input_tokens?: number | null; output_tokens?: number | null };
        Update: { status?: string; completed_at?: string | null; input_tokens?: number | null; output_tokens?: number | null };
        Relationships: [];
      };
    };
    Views: { [key in never]: never };
    Functions: {
      reserve_assistant_request: {
        Args: { p_id: string; p_unit: string; p_user: string; p_action: string; p_model: string };
        Returns: undefined;
      };
    };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
