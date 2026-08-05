export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          bucket: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket: string
          request_count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["category_kind"]
          locale: string
          name: string
          parent_id: string | null
          position: number
          seo: Json
          slug: string
          tenant_id: string
          translation_group_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["category_kind"]
          locale?: string
          name: string
          parent_id?: string | null
          position?: number
          seo?: Json
          slug: string
          tenant_id: string
          translation_group_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["category_kind"]
          locale?: string
          name?: string
          parent_id?: string | null
          position?: number
          seo?: Json
          slug?: string
          tenant_id?: string
          translation_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          alt_text: string | null
          bucket: string
          checksum: string | null
          created_at: string
          height: number | null
          id: string
          mime_type: string
          path: string
          provider: Database["public"]["Enums"]["storage_provider"]
          size_bytes: number
          tenant_id: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket: string
          checksum?: string | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          path: string
          provider?: Database["public"]["Enums"]["storage_provider"]
          size_bytes: number
          tenant_id: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          checksum?: string | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          path?: string
          provider?: Database["public"]["Enums"]["storage_provider"]
          size_bytes?: number
          tenant_id?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_revisions: {
        Row: {
          category_id: string | null
          content_html: string
          content_json: Json
          created_at: string
          created_by: string | null
          custom_fields: Json
          excerpt: string | null
          id: string
          locale: string
          post_id: string
          seo: Json
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tenant_id: string
          title: string
          version: number
        }
        Insert: {
          category_id?: string | null
          content_html: string
          content_json: Json
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          excerpt?: string | null
          id?: string
          locale?: string
          post_id: string
          seo?: Json
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tenant_id: string
          title: string
          version: number
        }
        Update: {
          category_id?: string | null
          content_html?: string
          content_json?: Json
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          excerpt?: string | null
          id?: string
          locale?: string
          post_id?: string
          seo?: Json
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          tenant_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content_html: string
          content_json: Json
          cover_media_id: string | null
          created_at: string
          custom_fields: Json
          deleted_at: string | null
          excerpt: string | null
          id: string
          locale: string
          published_at: string | null
          reading_time: number | null
          scheduled_for: string | null
          search_vector: unknown
          seo: Json
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tenant_id: string
          title: string
          translation_group_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string
          content_json?: Json
          cover_media_id?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          locale?: string
          published_at?: string | null
          reading_time?: number | null
          scheduled_for?: string | null
          search_vector?: unknown
          seo?: Json
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          tenant_id: string
          title: string
          translation_group_id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content_html?: string
          content_json?: Json
          cover_media_id?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          locale?: string
          published_at?: string | null
          reading_time?: number | null
          scheduled_for?: string | null
          search_vector?: unknown
          seo?: Json
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          tenant_id?: string
          title?: string
          translation_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          branding: Json
          created_at: string
          db_mode: Database["public"]["Enums"]["tenant_db_mode"]
          default_locale: string
          deleted_at: string | null
          external_db_key_ref: string | null
          external_db_url: string | null
          id: string
          limits: Json
          locales: string[]
          name: string
          plan: Database["public"]["Enums"]["tenant_plan"]
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          storage_bucket: string
          storage_provider: Database["public"]["Enums"]["storage_provider"]
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          db_mode?: Database["public"]["Enums"]["tenant_db_mode"]
          default_locale?: string
          deleted_at?: string | null
          external_db_key_ref?: string | null
          external_db_url?: string | null
          id?: string
          limits?: Json
          locales?: string[]
          name: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          storage_bucket?: string
          storage_provider?: Database["public"]["Enums"]["storage_provider"]
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          db_mode?: Database["public"]["Enums"]["tenant_db_mode"]
          default_locale?: string
          deleted_at?: string | null
          external_db_key_ref?: string | null
          external_db_url?: string | null
          id?: string
          limits?: Json
          locales?: string[]
          name?: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          storage_bucket?: string
          storage_provider?: Database["public"]["Enums"]["storage_provider"]
          updated_at?: string
        }
        Relationships: []
      }
      users_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_superadmin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_superadmin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_superadmin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          delivered_at: string | null
          error: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id: string
          next_attempt_at: string
          payload: Json
          status_code: number | null
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event: Database["public"]["Enums"]["webhook_event"]
          id?: string
          next_attempt_at?: string
          payload: Json
          status_code?: number | null
          tenant_id: string
          webhook_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event?: Database["public"]["Enums"]["webhook_event"]
          id?: string
          next_attempt_at?: string
          payload?: Json
          status_code?: number | null
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: Database["public"]["Enums"]["webhook_event"][]
          id: string
          is_active: boolean
          name: string
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: Database["public"]["Enums"]["webhook_event"][]
          id?: string
          is_active?: boolean
          name: string
          secret?: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: Database["public"]["Enums"]["webhook_event"][]
          id?: string
          is_active?: boolean
          name?: string
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      api_keys_public: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string | null
          key_prefix: string | null
          last_used_at: string | null
          name: string | null
          revoked_at: string | null
          scopes: string[] | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          revoked_at?: string | null
          scopes?: string[] | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          revoked_at?: string | null
          scopes?: string[] | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tenant_overview: {
        Row: {
          api_keys_count: number | null
          branding: Json | null
          created_at: string | null
          id: string | null
          last_activity_at: string | null
          limits: Json | null
          name: string | null
          plan: Database["public"]["Enums"]["tenant_plan"] | null
          posts_count: number | null
          published_count: number | null
          slug: string | null
          status: Database["public"]["Enums"]["tenant_status"] | null
          storage_bytes: number | null
          users_count: number | null
        }
        Insert: {
          api_keys_count?: never
          branding?: Json | null
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          limits?: Json | null
          name?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"] | null
          posts_count?: never
          published_count?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status"] | null
          storage_bytes?: never
          users_count?: never
        }
        Update: {
          api_keys_count?: never
          branding?: Json | null
          created_at?: string | null
          id?: string | null
          last_activity_at?: never
          limits?: Json | null
          name?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"] | null
          posts_count?: never
          published_count?: never
          slug?: string | null
          status?: Database["public"]["Enums"]["tenant_status"] | null
          storage_bytes?: never
          users_count?: never
        }
        Relationships: []
      }
    }
    Functions: {
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      create_api_key: {
        Args: { p_name: string; p_scopes?: string[]; p_tenant: string }
        Returns: {
          id: string
          key_prefix: string
          plain_key: string
        }[]
      }
      has_tenant_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["tenant_role"][]
          p_tenant: string
        }
        Returns: boolean
      }
      is_platform_context: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_tenant_manager: { Args: { p_tenant: string }; Returns: boolean }
      is_tenant_member: { Args: { p_tenant: string }; Returns: boolean }
      locales_are_valid: { Args: { p_locales: string[] }; Returns: boolean }
      prune_rate_limits: { Args: never; Returns: number }
      resolve_api_key: {
        Args: { p_prefix: string; p_secret: string }
        Returns: {
          api_key_id: string
          default_locale: string
          locales: string[]
          plan: Database["public"]["Enums"]["tenant_plan"]
          scopes: string[]
          tenant_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tenant_usage: { Args: { p_tenant: string }; Returns: Json }
      user_tenant_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      category_kind: "BLOG" | "CASE_STUDY" | "SERVICE" | "CUSTOM"
      content_status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
      storage_provider: "SUPABASE" | "S3" | "R2"
      tenant_db_mode: "SHARED" | "DEDICATED"
      tenant_plan: "FREE" | "PRO" | "ENTERPRISE"
      tenant_role: "OWNER" | "ADMIN" | "EDITOR" | "CONTRIBUTOR"
      tenant_status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED"
      webhook_event:
        | "post.created"
        | "post.published"
        | "post.updated"
        | "post.unpublished"
        | "post.deleted"
        | "category.updated"
        | "media.deleted"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      category_kind: ["BLOG", "CASE_STUDY", "SERVICE", "CUSTOM"],
      content_status: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      storage_provider: ["SUPABASE", "S3", "R2"],
      tenant_db_mode: ["SHARED", "DEDICATED"],
      tenant_plan: ["FREE", "PRO", "ENTERPRISE"],
      tenant_role: ["OWNER", "ADMIN", "EDITOR", "CONTRIBUTOR"],
      tenant_status: ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"],
      webhook_event: [
        "post.created",
        "post.published",
        "post.updated",
        "post.unpublished",
        "post.deleted",
        "category.updated",
        "media.deleted",
      ],
    },
  },
} as const

