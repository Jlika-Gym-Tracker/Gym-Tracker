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
          coaching_enabled: boolean;
          gym_name: string | null;
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
          coaching_enabled?: boolean;
          gym_name?: string | null;
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
          coaching_enabled?: boolean;
          gym_name?: string | null;
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
          assigned_by_coach_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          week_start: string;
          status?: WeekStatus;
          notes?: string | null;
          assigned_by_coach_id?: string | null;
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
          target_weight_kg: number | null;
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
          target_weight_kg?: number | null;
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
      ingredients: {
        Row: {
          id: string; owner_id: string | null; slug: string; name: string;
          category: string; kcal_per_100g: number; protein_g: number;
          carb_g: number; fat_g: number; allergens: string[]; unit_hint: string;
        };
        Insert: {
          id?: string; owner_id?: string | null; slug: string; name: string;
          category: string; kcal_per_100g: number; protein_g?: number;
          carb_g?: number; fat_g?: number; allergens?: string[]; unit_hint?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string; owner_id: string | null; slug: string; name: string;
          slot_hint: string | null; prep_minutes: number | null;
          image_url: string | null; steps: string[];
        };
        Insert: {
          id?: string; owner_id?: string | null; slug: string; name: string;
          slot_hint?: string | null; prep_minutes?: number | null;
          image_url?: string | null; steps?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: { recipe_id: string; ingredient_id: string; grams: number };
        Insert: { recipe_id: string; ingredient_id: string; grams: number };
        Update: Partial<Database["public"]["Tables"]["recipe_ingredients"]["Insert"]>;
        Relationships: [];
      };
      meal_plans: {
        Row: { id: string; user_id: string; week_start: string; created_at: string };
        Insert: { id?: string; user_id: string; week_start: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["meal_plans"]["Insert"]>;
        Relationships: [];
      };
      meal_plan_entries: {
        Row: {
          id: string; plan_id: string; planned_on: string; slot: string;
          recipe_id: string | null; servings: number; eaten: boolean;
        };
        Insert: {
          id?: string; plan_id: string; planned_on: string; slot: string;
          recipe_id?: string | null; servings?: number; eaten?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["meal_plan_entries"]["Insert"]>;
        Relationships: [];
      };
      grocery_items: {
        Row: {
          id: string; plan_id: string; ingredient_id: string;
          total_grams: number; checked: boolean;
        };
        Insert: {
          id?: string; plan_id: string; ingredient_id: string;
          total_grams: number; checked?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["grocery_items"]["Insert"]>;
        Relationships: [];
      };
      user_excludes: {
        Row: { user_id: string; kind: string; value: string };
        Insert: { user_id: string; kind: string; value: string };
        Update: Partial<Database["public"]["Tables"]["user_excludes"]["Insert"]>;
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string; training_days: number[]; default_rest_seconds: number;
          auto_rest: boolean; keyboard_shortcuts: boolean; show_e1rm: boolean;
          deficit_kcal: number; protein_g_per_kg: number; fat_pct: number;
          refeed_day: number | null; auto_adjust: boolean; ask_before_adjust: boolean;
          blur_thumbnails: boolean; strip_exif: boolean; notify_weighin: boolean;
          notify_unpublished_week: boolean; meals_per_day: number;
          week_starts_on: number;
        };
        Insert: {
          user_id: string; training_days?: number[]; default_rest_seconds?: number;
          auto_rest?: boolean; keyboard_shortcuts?: boolean; show_e1rm?: boolean;
          deficit_kcal?: number; protein_g_per_kg?: number; fat_pct?: number;
          refeed_day?: number | null; auto_adjust?: boolean; ask_before_adjust?: boolean;
          blur_thumbnails?: boolean; strip_exif?: boolean; notify_weighin?: boolean;
          notify_unpublished_week?: boolean; meals_per_day?: number;
          week_starts_on?: number;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
        Relationships: [];
      };
      sharing_prefs: {
        Row: {
          user_id: string; share_sessions: boolean; share_streak: boolean;
          share_program_name: boolean;
        };
        Insert: {
          user_id: string; share_sessions?: boolean; share_streak?: boolean;
          share_program_name?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["sharing_prefs"]["Insert"]>;
        Relationships: [];
      };
      crew_invites: {
        Row: {
          code: string; inviter_id: string; uses_left: number;
          expires_at: string; created_at: string;
        };
        Insert: {
          code: string; inviter_id: string; uses_left?: number;
          expires_at: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["crew_invites"]["Insert"]>;
        Relationships: [];
      };
      crew_links: {
        Row: { user_id: string; friend_id: string; created_at: string };
        Insert: { user_id: string; friend_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["crew_links"]["Insert"]>;
        Relationships: [];
      };
      league_seasons: {
        Row: {
          id: string; crew_owner_id: string; name: string;
          starts_on: string; ends_on: string; created_at: string;
        };
        Insert: {
          id?: string; crew_owner_id: string; name: string;
          starts_on: string; ends_on: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["league_seasons"]["Insert"]>;
        Relationships: [];
      };
      league_members: {
        Row: {
          season_id: string; user_id: string; start_weight_kg: number | null;
          start_waist_cm: number | null; start_e1rm: number | null; joined_at: string;
        };
        Insert: {
          season_id: string; user_id: string; start_weight_kg?: number | null;
          start_waist_cm?: number | null; start_e1rm?: number | null; joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["league_members"]["Insert"]>;
        Relationships: [];
      };
      league_scores: {
        Row: {
          season_id: string; user_id: string; week_index: number;
          consistency_pts: number; transformation_pts: number; sessions: number;
          goal_progress_pct: number | null; computed_at: string;
        };
        Insert: {
          season_id: string; user_id: string; week_index: number;
          consistency_pts?: number; transformation_pts?: number; sessions?: number;
          goal_progress_pct?: number | null; computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["league_scores"]["Insert"]>;
        Relationships: [];
      };
      challenges: {
        Row: {
          id: string; season_id: string | null; creator_id: string; kind: string;
          metric: string; title: string; target: number | null; stakes: string | null;
          starts_on: string; ends_on: string; status: string; created_at: string;
        };
        Insert: {
          id?: string; season_id?: string | null; creator_id: string; kind: string;
          metric: string; title: string; target?: number | null; stakes?: string | null;
          starts_on: string; ends_on: string; status?: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["challenges"]["Insert"]>;
        Relationships: [];
      };
      challenge_participants: {
        Row: { challenge_id: string; user_id: string; accepted: boolean; progress: number };
        Insert: { challenge_id: string; user_id: string; accepted?: boolean; progress?: number };
        Update: Partial<Database["public"]["Tables"]["challenge_participants"]["Insert"]>;
        Relationships: [];
      };
      badges: {
        Row: { user_id: string; season_id: string | null; slug: string; earned_at: string };
        Insert: { user_id: string; season_id?: string | null; slug: string; earned_at?: string };
        Update: Partial<Database["public"]["Tables"]["badges"]["Insert"]>;
        Relationships: [];
      };
      coach_invites: {
        Row: { code: string; coach_id: string; label: string | null; uses_left: number; expires_at: string; created_at: string };
        Insert: { code: string; coach_id: string; label?: string | null; uses_left?: number; expires_at: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["coach_invites"]["Insert"]>;
        Relationships: [];
      };
      coach_links: {
        Row: {
          coach_id: string; athlete_id: string; status: "active" | "paused" | "ended";
          share_training: boolean; share_body_metrics: boolean;
          share_photos: boolean; share_nutrition: boolean; created_at: string;
        };
        Insert: {
          coach_id: string; athlete_id: string; status?: "active" | "paused" | "ended";
          share_training?: boolean; share_body_metrics?: boolean;
          share_photos?: boolean; share_nutrition?: boolean; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coach_links"]["Insert"]>;
        Relationships: [];
      };
      coach_programs: {
        Row: { id: string; coach_id: string; name: string; notes: string | null; created_at: string };
        Insert: { id?: string; coach_id: string; name: string; notes?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["coach_programs"]["Insert"]>;
        Relationships: [];
      };
      coach_program_days: {
        Row: { id: string; program_id: string; day_index: number; name: string; focus_note: string | null; is_rest: boolean };
        Insert: { id?: string; program_id: string; day_index: number; name: string; focus_note?: string | null; is_rest?: boolean };
        Update: Partial<Database["public"]["Tables"]["coach_program_days"]["Insert"]>;
        Relationships: [];
      };
      coach_program_exercises: {
        Row: {
          id: string; day_id: string; exercise_id: string; position: number;
          target_sets: number; rep_min: number | null; rep_max: number | null;
          per_side: boolean; note: string | null; target_weight_kg: number | null;
        };
        Insert: {
          id?: string; day_id: string; exercise_id: string; position: number;
          target_sets: number; rep_min?: number | null; rep_max?: number | null;
          per_side?: boolean; note?: string | null; target_weight_kg?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["coach_program_exercises"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      crew_overview: {
        Args: Record<string, never>;
        Returns: {
          friend_id: string;
          display_name: string;
          avatar_url: string | null;
          program_name: string | null;
          sessions_this_week: number[];
          streak: number;
        }[];
      };
      redeem_crew_invite: {
        Args: { invite_code: string };
        Returns: { friend_id: string; friend_name: string }[];
      };
      redeem_coach_invite: {
        Args: { invite_code: string };
        Returns: { coach_id: string; coach_name: string }[];
      };
      swap_program_days: {
        Args: { day_a: string; day_b: string };
        Returns: undefined;
      };
      coach_invite_preview: {
        Args: { invite_code: string };
        Returns: {
          coach_id: string | null;
          coach_name: string | null;
          avatar_url: string | null;
          gym_name: string | null;
          reason: string;
        }[];
      };
      coach_names: {
        Args: { coach_ids: string[] };
        Returns: { coach_id: string; display_name: string; avatar_url: string | null }[];
      };
      coach_roster: {
        Args: Record<string, never>;
        Returns: {
          athlete_id: string;
          display_name: string;
          avatar_url: string | null;
          goal: string;
          sessions_this_week: number;
          planned_this_week: number;
          sets_this_week: number;
          last_session_at: string | null;
          week_dots: number[];
          shares_body: boolean;
          shares_photos: boolean;
          shares_nutrition: boolean;
        }[];
      };
      league_standings: {
        Args: { target_season: string };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          consistency_pts: number;
          transformation_pts: number;
          sessions: number;
          goal_progress_pct: number | null;
          week_dots: number[];
        }[];
      };
    };
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
export type Ingredient = Tables<"ingredients">;
export type Recipe = Tables<"recipes">;
export type MealPlan = Tables<"meal_plans">;
export type MealPlanEntry = Tables<"meal_plan_entries">;
export type GroceryItem = Tables<"grocery_items">;
export type UserSettings = Tables<"user_settings">;
export type UserExclude = Tables<"user_excludes">;
export type SharingPrefs = Tables<"sharing_prefs">;
export type CrewInvite = Tables<"crew_invites">;
export type CrewMember = Database["public"]["Functions"]["crew_overview"]["Returns"][number];
export type LeagueSeason = Tables<"league_seasons">;
export type LeagueMember = Tables<"league_members">;
export type LeagueScore = Tables<"league_scores">;
export type Challenge = Tables<"challenges">;
export type Badge = Tables<"badges">;
export type CoachInvite = Tables<"coach_invites">;
export type CoachInvitePreview =
  Database["public"]["Functions"]["coach_invite_preview"]["Returns"][number];
export type CoachLink = Tables<"coach_links">;
export type CoachProgram = Tables<"coach_programs">;
export type ShareScope = "training" | "body" | "photos" | "nutrition";
export type RosterAthlete =
  Database["public"]["Functions"]["coach_roster"]["Returns"][number];
export type LeagueStandingRow =
  Database["public"]["Functions"]["league_standings"]["Returns"][number];
