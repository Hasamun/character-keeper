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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          reason: string
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          reason?: string
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          reason?: string
          target_id?: string
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          archived: boolean
          category: string
          created_at: string
          data: Json
          id: string
          name: string
          owner_id: string
          price_value: number | null
          rank: string
          rank_order: number | null
          slot: string
          subtype: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          category: string
          created_at?: string
          data: Json
          id?: string
          name: string
          owner_id: string
          price_value?: number | null
          rank?: string
          rank_order?: number | null
          slot?: string
          subtype?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          data?: Json
          id?: string
          name?: string
          owner_id?: string
          price_value?: number | null
          rank?: string
          rank_order?: number | null
          slot?: string
          subtype?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_submissions: {
        Row: {
          catalog_id: string | null
          created_at: string
          data: Json
          id: string
          owner_id: string
          reason: string
          revision: number
          status: string
          updated_at: string
        }
        Insert: {
          catalog_id?: string | null
          created_at?: string
          data: Json
          id?: string
          owner_id: string
          reason?: string
          revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          catalog_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          owner_id?: string
          reason?: string
          revision?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_submissions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      character_invites: {
        Row: {
          character_id: string
          created_at: string
          expires_at: string
          id: string
          owner_id: string
          permissions: Json
          recipient_id: string | null
          status: string
          token_hash: string | null
        }
        Insert: {
          character_id: string
          created_at?: string
          expires_at?: string
          id?: string
          owner_id: string
          permissions: Json
          recipient_id?: string | null
          status?: string
          token_hash?: string | null
        }
        Update: {
          character_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          permissions?: Json
          recipient_id?: string | null
          status?: string
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_invites_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_invites_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_invites_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      character_members: {
        Row: {
          character_id: string
          created_at: string
          permissions: Json
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          permissions: Json
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          permissions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_members_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_blocked: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_blocked?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_blocked?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_active: { Args: never; Returns: boolean }
      archive_catalog: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      character_invitation: {
        Args: { _action?: string; _id?: string; _token?: string }
        Returns: Json
      }
      character_permission: { Args: { _id: string }; Returns: Json }
      commit_character_section: {
        Args: {
          _actor: string
          _data: Json
          _expected: string
          _id: string
          _log: string
          _sections: string[]
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      manage_character_access: {
        Args: {
          _action: string
          _email?: string
          _id: string
          _permissions?: Json
          _target?: string
          _token?: string
        }
        Returns: string
      }
      review_catalog: {
        Args: {
          _approve: boolean
          _id: string
          _reason?: string
          _revision: number
        }
        Returns: string
      }
      set_account_block: {
        Args: { _blocked: boolean; _id: string; _reason: string }
        Returns: undefined
      }
      shared_item_image_access: { Args: { _path: string }; Returns: boolean }
      submit_catalog: {
        Args: { _catalog_id?: string; _data: Json; _submission_id?: string }
        Returns: string
      }
      valid_character_permissions: { Args: { p: Json }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
