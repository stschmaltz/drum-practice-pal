export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      loops: {
        Row: {
          created_at: string;
          end_bar: number;
          finished_at: string | null;
          id: string;
          last_practiced_at: string | null;
          name: string;
          song_id: string;
          speed_ratio: number;
          start_bar: number;
          status: Database['public']['Enums']['loop_status'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          end_bar: number;
          finished_at?: string | null;
          id?: string;
          last_practiced_at?: string | null;
          name: string;
          song_id: string;
          speed_ratio?: number;
          start_bar: number;
          status?: Database['public']['Enums']['loop_status'];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          end_bar?: number;
          finished_at?: string | null;
          id?: string;
          last_practiced_at?: string | null;
          name?: string;
          song_id?: string;
          speed_ratio?: number;
          start_bar?: number;
          status?: Database['public']['Enums']['loop_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'loops_song_fkey';
            columns: ['song_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      practice_sessions: {
        Row: {
          created_at: string;
          duration_seconds: number;
          id: string;
          loop_id: string;
          repeats: number;
          speed_ratio: number;
          started_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          duration_seconds: number;
          id?: string;
          loop_id: string;
          repeats?: number;
          speed_ratio: number;
          started_at: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number;
          id?: string;
          loop_id?: string;
          repeats?: number;
          speed_ratio?: number;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'practice_sessions_loop_fkey';
            columns: ['loop_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'loops';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      songs: {
        Row: {
          artist: string;
          bar_count: number;
          created_at: string;
          drum_track_index: number | null;
          file_hash: string;
          file_path: string;
          id: string;
          original_tempo: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          artist?: string;
          bar_count: number;
          created_at?: string;
          drum_track_index?: number | null;
          file_hash: string;
          file_path: string;
          id?: string;
          original_tempo: number;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          artist?: string;
          bar_count?: number;
          created_at?: string;
          drum_track_index?: number | null;
          file_hash?: string;
          file_path?: string;
          id?: string;
          original_tempo?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          count_in_bars: number;
          count_in_mode: Database['public']['Enums']['count_in_mode'];
          created_at: string;
          drums_muted_default: boolean;
          metronome_on: boolean;
          metronome_volume: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          count_in_bars?: number;
          count_in_mode?: Database['public']['Enums']['count_in_mode'];
          created_at?: string;
          drums_muted_default?: boolean;
          metronome_on?: boolean;
          metronome_volume?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          count_in_bars?: number;
          count_in_mode?: Database['public']['Enums']['count_in_mode'];
          created_at?: string;
          drums_muted_default?: boolean;
          metronome_on?: boolean;
          metronome_volume?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      count_in_mode: 'start' | 'every_repeat';
      loop_status: 'active' | 'finished';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      count_in_mode: ['start', 'every_repeat'],
      loop_status: ['active', 'finished'],
    },
  },
} as const;
