// Generated from supabase/migrations by npm run db:types. Do not edit.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_movements: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          type: Database['public']['Enums']['movement_type'];
          amount: number;
          movement_date: string;
          origin_type: Database['public']['Enums']['movement_origin_type'];
          origin_id: string | null;
          transfer_group_id: string | null;
          reversal_of_movement_id: string | null;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          type: Database['public']['Enums']['movement_type'];
          amount: number;
          movement_date: string;
          origin_type: Database['public']['Enums']['movement_origin_type'];
          origin_id?: string | null;
          transfer_group_id?: string | null;
          reversal_of_movement_id?: string | null;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          type?: Database['public']['Enums']['movement_type'];
          amount?: number;
          movement_date?: string;
          origin_type?: Database['public']['Enums']['movement_origin_type'];
          origin_id?: string | null;
          transfer_group_id?: string | null;
          reversal_of_movement_id?: string | null;
          description?: string;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "account_movements_account_fkey"; columns: ["user_id","account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "account_movements_reversal_fkey"; columns: ["user_id","reversal_of_movement_id"]; isOneToOne: false; referencedRelation: "account_movements"; referencedColumns: ["user_id","id"] },
        ];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: Database['public']['Enums']['account_type'];
          initial_balance: number;
          initial_balance_date: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: Database['public']['Enums']['account_type'];
          initial_balance?: number;
          initial_balance_date: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: Database['public']['Enums']['account_type'];
          initial_balance?: number;
          initial_balance_date?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: Database['public']['Enums']['transaction_type'];
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: Database['public']['Enums']['transaction_type'];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: Database['public']['Enums']['transaction_type'];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      credit_card_invoices: {
        Row: {
          id: string;
          user_id: string;
          credit_card_id: string;
          reference_month: string;
          closing_date: string;
          due_date: string;
          status: Database['public']['Enums']['invoice_status'];
          paid_at: string | null;
          payment_account_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          credit_card_id: string;
          reference_month: string;
          closing_date: string;
          due_date: string;
          status?: Database['public']['Enums']['invoice_status'];
          paid_at?: string | null;
          payment_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          credit_card_id?: string;
          reference_month?: string;
          closing_date?: string;
          due_date?: string;
          status?: Database['public']['Enums']['invoice_status'];
          paid_at?: string | null;
          payment_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "credit_card_invoices_card_fkey"; columns: ["user_id","credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "credit_card_invoices_payment_account_fkey"; columns: ["user_id","payment_account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["user_id","id"] },
        ];
      };
      credit_cards: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          limit_amount: number;
          closing_day: number;
          due_day: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          limit_amount: number;
          closing_day: number;
          due_day: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          limit_amount?: number;
          closing_day?: number;
          due_day?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      installment_groups: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          original_amount: number;
          installment_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          original_amount: number;
          installment_count: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          original_amount?: number;
          installment_count?: number;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      recurrence_rules: {
        Row: {
          id: string;
          user_id: string;
          type: Database['public']['Enums']['transaction_type'];
          description: string;
          category_id: string;
          amount: number;
          frequency: Database['public']['Enums']['recurrence_frequency'];
          interval_count: number;
          start_date: string;
          end_date: string | null;
          max_occurrences: number | null;
          planned_payment_method: Database['public']['Enums']['payment_method'] | null;
          account_id: string | null;
          credit_card_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database['public']['Enums']['transaction_type'];
          description: string;
          category_id: string;
          amount: number;
          frequency: Database['public']['Enums']['recurrence_frequency'];
          interval_count?: number;
          start_date: string;
          end_date?: string | null;
          max_occurrences?: number | null;
          planned_payment_method?: Database['public']['Enums']['payment_method'] | null;
          account_id?: string | null;
          credit_card_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Database['public']['Enums']['transaction_type'];
          description?: string;
          category_id?: string;
          amount?: number;
          frequency?: Database['public']['Enums']['recurrence_frequency'];
          interval_count?: number;
          start_date?: string;
          end_date?: string | null;
          max_occurrences?: number | null;
          planned_payment_method?: Database['public']['Enums']['payment_method'] | null;
          account_id?: string | null;
          credit_card_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          notes?: string | null;
        };
        Relationships: [
          { foreignKeyName: "recurrence_rules_account_fkey"; columns: ["user_id","account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "recurrence_rules_card_fkey"; columns: ["user_id","credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "recurrence_rules_category_fkey"; columns: ["user_id","category_id","type"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["user_id","id","type"] },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: Database['public']['Enums']['transaction_type'];
          description: string;
          category_id: string;
          amount: number;
          transaction_date: string;
          due_date: string | null;
          status: Database['public']['Enums']['transaction_status'];
          planned_payment_method: Database['public']['Enums']['payment_method'] | null;
          actual_payment_method: Database['public']['Enums']['payment_method'] | null;
          account_id: string | null;
          credit_card_id: string | null;
          credit_card_invoice_id: string | null;
          installment_group_id: string | null;
          installment_number: number | null;
          installment_total: number | null;
          recurrence_rule_id: string | null;
          settled_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database['public']['Enums']['transaction_type'];
          description: string;
          category_id: string;
          amount: number;
          transaction_date: string;
          due_date?: string | null;
          status?: Database['public']['Enums']['transaction_status'];
          planned_payment_method?: Database['public']['Enums']['payment_method'] | null;
          actual_payment_method?: Database['public']['Enums']['payment_method'] | null;
          account_id?: string | null;
          credit_card_id?: string | null;
          credit_card_invoice_id?: string | null;
          installment_group_id?: string | null;
          installment_number?: number | null;
          installment_total?: number | null;
          recurrence_rule_id?: string | null;
          settled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Database['public']['Enums']['transaction_type'];
          description?: string;
          category_id?: string;
          amount?: number;
          transaction_date?: string;
          due_date?: string | null;
          status?: Database['public']['Enums']['transaction_status'];
          planned_payment_method?: Database['public']['Enums']['payment_method'] | null;
          actual_payment_method?: Database['public']['Enums']['payment_method'] | null;
          account_id?: string | null;
          credit_card_id?: string | null;
          credit_card_invoice_id?: string | null;
          installment_group_id?: string | null;
          installment_number?: number | null;
          installment_total?: number | null;
          recurrence_rule_id?: string | null;
          settled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "transactions_account_fkey"; columns: ["user_id","account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "transactions_card_fkey"; columns: ["user_id","credit_card_id"]; isOneToOne: false; referencedRelation: "credit_cards"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "transactions_category_fkey"; columns: ["user_id","category_id","type"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["user_id","id","type"] },
          { foreignKeyName: "transactions_installment_group_fkey"; columns: ["user_id","installment_group_id"]; isOneToOne: false; referencedRelation: "installment_groups"; referencedColumns: ["user_id","id"] },
          { foreignKeyName: "transactions_invoice_fkey"; columns: ["user_id","credit_card_invoice_id","credit_card_id"]; isOneToOne: false; referencedRelation: "credit_card_invoices"; referencedColumns: ["user_id","id","credit_card_id"] },
          { foreignKeyName: "transactions_recurrence_rule_fkey"; columns: ["user_id","recurrence_rule_id"]; isOneToOne: false; referencedRelation: "recurrence_rules"; referencedColumns: ["user_id","id"] },
        ];
      };
    };
    Views: {
      account_balances: {
        Row: {
          account_id: string | null;
          user_id: string | null;
          name: string | null;
          type: Database['public']['Enums']['account_type'] | null;
          active: boolean | null;
          initial_balance: number | null;
          initial_balance_date: string | null;
          total_in: number | null;
          total_out: number | null;
          current_balance: number | null;
        };
        Relationships: [
        ];
      };
      invoice_totals: {
        Row: {
          invoice_id: string | null;
          user_id: string | null;
          credit_card_id: string | null;
          reference_month: string | null;
          status: Database['public']['Enums']['invoice_status'] | null;
          total_amount: number | null;
          transaction_count: number | null;
        };
        Relationships: [
        ];
      };
    };
    Functions: {
      close_invoice: { Args: { p_invoice_id: string | null }; Returns: undefined };
      create_card_purchase: { Args: { p_credit_card_id: string | null; p_category_id: string | null; p_description: string | null; p_amount: number | null; p_transaction_date: string | null; p_installment_count?: number | null }; Returns: (string)[] };
      create_expense_card_purchase: { Args: { p_credit_card_id: string | null; p_category_id: string | null; p_description: string | null; p_amount: number | null; p_transaction_date: string | null; p_notes: string | null; p_installment_count: number | null }; Returns: (string)[] };
      create_expense_recurrence: { Args: { p_description: string | null; p_category_id: string | null; p_amount: number | null; p_frequency: Database['public']['Enums']['recurrence_frequency'] | null; p_interval_count: number | null; p_start_date: string | null; p_end_date: string | null; p_max_occurrences: number | null; p_payment_method: Database['public']['Enums']['payment_method'] | null; p_credit_card_id: string | null; p_account_id: string | null; p_notes: string | null; p_through_date: string | null }; Returns: string };
      create_income_recurrence: { Args: { p_description: string | null; p_category_id: string | null; p_amount: number | null; p_frequency: Database['public']['Enums']['recurrence_frequency'] | null; p_interval_count: number | null; p_start_date: string | null; p_end_date: string | null; p_max_occurrences: number | null; p_account_id: string | null; p_notes: string | null; p_through_date: string | null }; Returns: string };
      create_installment_expense: { Args: { p_description: string | null; p_category_id: string | null; p_amount: number | null; p_transaction_date: string | null; p_due_date: string | null; p_payment_method: Database['public']['Enums']['payment_method'] | null; p_notes: string | null; p_account_id: string | null; p_installment_count: number | null }; Returns: (string)[] };
      create_paid_expense: { Args: { p_description: string | null; p_category_id: string | null; p_amount: number | null; p_transaction_date: string | null; p_due_date: string | null; p_planned_payment_method: Database['public']['Enums']['payment_method'] | null; p_notes: string | null; p_account_id: string | null; p_payment_method: Database['public']['Enums']['payment_method'] | null; p_settled_at: string | null }; Returns: string };
      create_received_income: { Args: { p_description: string | null; p_category_id: string | null; p_amount: number | null; p_transaction_date: string | null; p_due_date: string | null; p_notes: string | null; p_account_id: string | null; p_received_at: string | null }; Returns: string };
      generate_recurrences: { Args: { p_through_date: string | null }; Returns: number };
      pay_invoice: { Args: { p_invoice_id: string | null; p_account_id: string | null; p_paid_at: string | null }; Returns: string };
      reverse_movement: { Args: { p_movement_id: string | null; p_reversed_at: string | null }; Returns: string };
      reverse_transfer_group: { Args: { p_transfer_group_id: string | null; p_reversed_at: string | null }; Returns: string };
      settle_transaction: { Args: { p_transaction_id: string | null; p_account_id: string | null; p_payment_method: Database['public']['Enums']['payment_method'] | null; p_settled_at: string | null }; Returns: string };
      transfer_between_accounts: { Args: { p_from_account_id: string | null; p_to_account_id: string | null; p_amount: number | null; p_movement_date: string | null; p_description: string | null; p_transfer_group_id: string | null }; Returns: string };
      update_expense: { Args: { p_expense_id: string | null; p_description: string | null; p_category_id: string | null; p_amount: number | null; p_transaction_date: string | null; p_due_date: string | null; p_payment_method: Database['public']['Enums']['payment_method'] | null; p_credit_card_id: string | null; p_account_id: string | null; p_notes: string | null }; Returns: string };
      update_income: { Args: { p_income_id: string | null; p_description: string | null; p_category_id: string | null; p_amount: number | null; p_transaction_date: string | null; p_due_date: string | null; p_notes: string | null }; Returns: string };
    };
    Enums: {
      account_type: "checking" | "savings" | "cash" | "other";
      invoice_status: "open" | "closed" | "paid";
      movement_origin_type: "expense_payment" | "income_receipt" | "credit_card_payment" | "transfer" | "balance_adjustment" | "reversal";
      movement_type: "in" | "out";
      payment_method: "credit_card" | "debit_card" | "pix" | "cash" | "boleto" | "bank_transfer" | "other";
      recurrence_frequency: "daily" | "weekly" | "monthly" | "yearly";
      transaction_status: "pending" | "settled";
      transaction_type: "expense" | "income";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
