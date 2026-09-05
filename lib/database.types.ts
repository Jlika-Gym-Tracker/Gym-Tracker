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
export type WeekStatus = "draft" | "published" | "archived";

export type Muscle =
  | "chest" | "lats" | "middle_back" | "lower_back" | "traps" | "shoulders"
  | "biceps" | "triceps" | "forearms" | "quadriceps" | "hamstrings" | "glutes"
  | "calves" | "abdominals" | "abductors" | "adductors" | "neck";

export type Equipment =
  | "barbell" | "dumbbell" | "machine" | "cable" | "body_only" | "bands"
  | "kettlebells" | "ez_curl_bar" | "exercise_ball" | "medicine_ball"
  | "foam_roll" | "other";

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
      exercises: {
        Row: {
          id: string;
          owner_id: string | null;
          slug: string;
          name: string;
          primary_muscle: Muscle;
          secondary_muscles: string[];
          equipment: Equipment;
          aliases: string[];
          video_url: string | null;
          image_start_url: string | null;
          image_end_url: string | null;
          cues: string[];
          how_to: string[];
          common_mistake: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          slug: string;
          name: string;
          primary_muscle: Muscle;
          secondary_muscles?: string[];
          equipment: Equipment;
          aliases?: string[];
          video_url?: string | null;
          image_start_url?: string | null;
          image_end_url?: string | null;
          cues?: string[];
          how_to?: string[];
          common_mistake?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["exercises"]["Insert"]>;
        Relationships: [];
      };
      program_weeks: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          week_start: string;
          status: WeekStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          week_start: string;
          status?: WeekStatus;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["program_weeks"]["Insert"]>;
        Relationships: [];
      };
      program_days: {
        Row: {
          id: string;
          week_id: string;
          day_index: number;
          name: string;
          focus_note: string | null;
          is_rest: boolean;
        };
        Insert: {
          id?: string;
          week_id: string;
          day_index: number;
          name: string;
          focus_note?: string | null;
          is_rest?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["program_days"]["Insert"]>;
        Relationships: [];
      };
      program_exercises: {
        Row: {
          id: string;
          day_id: string;
          exercise_id: string;
          position: number;
          target_sets: number;
          rep_min: number | null;
          rep_max: number | null;
          per_side: boolean;
          note: string | null;
        };
        Insert: {
          id?: string;
          day_id: string;
          exercise_id: string;
          position: number;
          target_sets: number;
          rep_min?: number | null;
          rep_max?: number | null;
          per_side?: boolean;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["program_exercises"]["Insert"]>;
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          day_id: string | null;
          title: string | null;
          started_at: string;
          ended_at: string | null;
          bodyweight_kg: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          day_id?: string | null;
          title?: string | null;
          started_at?: string;
          ended_at?: string | null;
          bodyweight_kg?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workout_sessions"]["Insert"]>;
        Relationships: [];
      };
      set_logs: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          set_index: number;
          weight_kg: number | null;
          reps: number | null;
          rpe: number | null;
          is_complete: boolean;
          logged_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          exercise_id: string;
          set_index: number;
          weight_kg?: number | null;
          reps?: number | null;
          rpe?: number | null;
          is_complete?: boolean;
          logged_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["set_logs"]["Insert"]>;
        Relationships: [];
      };
      body_metrics: {
        Row: {
          id: string;
          user_id: string;
          measured_on: string;
          weight_kg: number | null;
          waist_cm: number | null;
          chest_cm: number | null;
          arm_cm: number | null;
          thigh_cm: number | null;
          hip_cm: number | null;
          bodyfat_pct: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          measured_on: string;
          weight_kg?: number | null;
          waist_cm?: number | null;
          chest_cm?: number | null;
          arm_cm?: number | null;
          thigh_cm?: number | null;
          hip_cm?: number | null;
          bodyfat_pct?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["body_metrics"]["Insert"]>;
        Relationships: [];
      };
      progress_photos: {
        Row: {
          id: string;
          user_id: string;
          taken_on: string;
          pose: "front" | "side" | "back";
          storage_path: string;
          weight_kg: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          taken_on: string;
          pose: "front" | "side" | "back";
          storage_path: string;
          weight_kg?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["progress_photos"]["Insert"]>;
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
export type Exercise = Tables<"exercises">;
export type ProgramWeek = Tables<"program_weeks">;
export type ProgramDay = Tables<"program_days">;
export type ProgramExercise = Tables<"program_exercises">;
export type WorkoutSession = Tables<"workout_sessions">;
export type SetLog = Tables<"set_logs">;
export type BodyMetric = Tables<"body_metrics">;
export type ProgressPhoto = Tables<"progress_photos">;
export type Pose = "front" | "side" | "back";
