export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          basiq_account_id: string | null
          created_at: string
          credit_limit: number | null
          currency: string
          id: string
          institution: string | null
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          basiq_account_id?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          id?: string
          institution?: string | null
          name: string
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          balance?: number
          basiq_account_id?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          id?: string
          institution?: string | null
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      allocation_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          name: string
          notes: string | null
          pool_id: string
          priority_order: number
          target_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pool_id: string
          priority_order?: number
          target_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pool_id?: string
          priority_order?: number
          target_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "allocation_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "allocation_summary_view"
            referencedColumns: ["pool_id"]
          },
        ]
      }
      allocation_pools: {
        Row: {
          created_at: string
          id: string
          linked_account_id: string | null
          manual_total: number
          name: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_account_id?: string | null
          manual_total?: number
          name: string
          source: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_account_id?: string | null
          manual_total?: number
          name?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_pools_linked_account_id_fkey"
            columns: ["linked_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      basiq_connections: {
        Row: {
          basiq_user_id: string
          created_at: string
          last_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          basiq_user_id: string
          created_at?: string
          last_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          basiq_user_id?: string
          created_at?: string
          last_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categorisation_rules: {
        Row: {
          active: boolean
          amount_max: number | null
          amount_min: number | null
          category_id: string | null
          created_at: string
          id: string
          match_type: string
          merchant_id: string | null
          pattern: string | null
          priority: number
          set_tax_deductible: boolean | null
          subcategory_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_max?: number | null
          amount_min?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          match_type: string
          merchant_id?: string | null
          pattern?: string | null
          priority?: number
          set_tax_deductible?: boolean | null
          subcategory_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount_max?: number | null
          amount_min?: number | null
          category_id?: string | null
          created_at?: string
          id?: string
          match_type?: string
          merchant_id?: string | null
          pattern?: string | null
          priority?: number
          set_tax_deductible?: boolean | null
          subcategory_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorisation_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorisation_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorisation_rules_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_aliases: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          pattern: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          pattern: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          pattern?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_aliases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          default_category_id: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      networth_classes: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          is_liquid: boolean
          kind: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          is_liquid?: boolean
          kind: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          is_liquid?: boolean
          kind?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      networth_items: {
        Row: {
          active: boolean
          class_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          class_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "networth_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "networth_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_items: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          direction: string
          frequency: string
          id: string
          name: string
          next_due_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          direction: string
          frequency: string
          id?: string
          name: string
          next_due_date: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          direction?: string
          frequency?: string
          id?: string
          name?: string
          next_due_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
          user_id?: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          ai_category_id: string | null
          ai_confidence: number | null
          ai_reason: string | null
          amount: number
          basiq_transaction_id: string | null
          category_id: string | null
          created_at: string
          date: string
          description: string | null
          human_verified: boolean
          id: string
          import_hash: string | null
          merchant_id: string | null
          notes: string | null
          subcategory_id: string | null
          tax_deductible: boolean
          transfer_group_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          ai_category_id?: string | null
          ai_confidence?: number | null
          ai_reason?: string | null
          amount: number
          basiq_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          human_verified?: boolean
          id?: string
          import_hash?: string | null
          merchant_id?: string | null
          notes?: string | null
          subcategory_id?: string | null
          tax_deductible?: boolean
          transfer_group_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          ai_category_id?: string | null
          ai_confidence?: number | null
          ai_reason?: string | null
          amount?: number
          basiq_transaction_id?: string | null
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          human_verified?: boolean
          id?: string
          import_hash?: string | null
          merchant_id?: string | null
          notes?: string | null
          subcategory_id?: string | null
          tax_deductible?: boolean
          transfer_group_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_ai_category_id_fkey"
            columns: ["ai_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      value_entries: {
        Row: {
          created_at: string
          date: string
          id: string
          item_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          item_id: string
          user_id?: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          item_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "value_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "networth_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_txn_totals_view: {
        Row: {
          account_id: string | null
          txn_total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_category_breakdown_view: {
        Row: {
          category_id: string | null
          category_name: string | null
          month: string | null
          total: number | null
          txn_count: number | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      allocation_summary_view: {
        Row: {
          allocated: number | null
          pool_id: string | null
          pool_name: string | null
          source: string | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_cashflow_view: {
        Row: {
          expenses: number | null
          income: number | null
          month: string | null
          net_cash_flow: number | null
          savings_rate: number | null
          user_id: string | null
        }
        Relationships: []
      }
      networth_current_view: {
        Row: {
          assets: number | null
          liabilities: number | null
          liquid_assets: number | null
          liquidity_ratio: number | null
          net_liquid: number | null
          net_worth: number | null
          user_id: string | null
        }
        Relationships: []
      }
      networth_history_view: {
        Row: {
          assets: number | null
          liabilities: number | null
          liquid_assets: number | null
          liquidity_ratio: number | null
          month: string | null
          net_liquid: number | null
          net_worth: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      link_split_bill: {
        Args: { p_expense_id: string; p_income_ids: string[] }
        Returns: string
      }
      sync_account_networth: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      unlink_split_bill: {
        Args: { p_txn_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
