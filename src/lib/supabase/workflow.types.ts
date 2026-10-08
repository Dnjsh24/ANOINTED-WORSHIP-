import type { Database, Json } from "@/lib/supabase/database.types";
import type { AssignmentState, PreparationTask, ReadinessState, RehearsalAllocationRow, ServiceOrderEntry } from "@/lib/domain/team-workflows";

export type RehearsalPlanRow = { setlist_id: string; team_id: string; revision: number; allocations: RehearsalAllocationRow[]; tasks: PreparationTask[]; updated_by: string; updated_at: string };
export type PreparationResponseRow = { setlist_id: string; task_key: string; team_member_id: string; completed: boolean; updated_at: string };
export type SongReadinessRow = { event_id: string; slot_id: string; team_member_id: string; state: ReadinessState; note: string; updated_at: string };
export type ServiceOrderRow = { event_id: string; team_id: string; revision: number; entries: ServiceOrderEntry[]; required_roles: string[]; updated_by: string; updated_at: string };
export type AssignmentResponseRow = { assignment_id: string; team_member_id: string; state: AssignmentState; note: string; updated_at: string };
type ReadTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };
// Extend the generated baseline locally until operators can regenerate the
// complete deployed schema. All mutations go through actor-derived RPCs.
export type WorkflowDatabase = Database & {
  public: {
    Tables: {
      rehearsal_plans: ReadTable<RehearsalPlanRow>;
      rehearsal_task_responses: ReadTable<PreparationResponseRow>;
      song_readiness: ReadTable<SongReadinessRow>;
      service_orders: ReadTable<ServiceOrderRow>;
      assignment_responses: ReadTable<AssignmentResponseRow>;
    };
    Functions: {
      save_rehearsal_plan: { Args: { p_setlist_id: string; p_expected_revision: number; p_allocations: Json; p_tasks: Json }; Returns: number };
      save_service_order: { Args: { p_event_id: string; p_expected_revision: number; p_entries: Json; p_required_roles: string[] }; Returns: number };
      respond_preparation_task: { Args: { p_setlist_id: string; p_task_key: string; p_completed: boolean }; Returns: undefined };
      respond_song_readiness: { Args: { p_slot_id: string; p_state: ReadinessState; p_note: string }; Returns: undefined };
      respond_assignment: { Args: { p_assignment_id: string; p_state: AssignmentState; p_note: string }; Returns: undefined };
    };
  };
};
