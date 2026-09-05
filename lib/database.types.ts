/**
 * Mirrors `supabase gen types typescript --local > lib/database.types.ts`.
 * Regenerate after every migration rather than editing by hand.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Goal = "cut" | "bulk" | "recomp" | "strength" | "health";
export type Sex = "male" | "female" | "other";
export type UnitSystem = "metric" | "imperial";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          sex: Sex | null;
          birth_date: string | null;
          height_cm: number | null;
          unit_system: UnitSystem;
          goal: Goal;
          activity_factor: number;
          calorie_target: number | null;
          protein_target_g: number | null;
          carb_target_g: number | null;
          fat_target_g: number | null;
          training_day_kcal_bonus: number;
          onboarded_at: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          sex?: Sex | null;
          birth_date?: string | null;
          height_cm?: number | null;
          unit_system?: UnitSystem;
          goal?: Goal;
          activity_factor?: number;
          calorie_target?: number | null;
          protein_target_g?: number | null;
          carb_target_g?: number | null;
          fat_target_g?: number | null;
          training_day_kcal_bonus?: number;
          onboarded_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          sex?: Sex | null;
          birth_date?: string | null;
          height_cm?: number | null;
          unit_system?: UnitSystem;
          goal?: Goal;
          activity_factor?: number;
          calorie_target?: number | null;
          protein_target_g?: number | null;
          carb_target_g?: number | null;
          fat_target_g?: number | null;
          training_day_kcal_bonus?: number;
          onboarded_at?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Profile = Tables<"profiles">;
