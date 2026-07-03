export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TeamRole = "owner" | "admin" | "pastor" | "worship_leader" | "band_leader" | "band_member" | "dancer" | "media" | "member";
type MemberStatus = "active" | "inactive";
type JoinRequestStatus = "pending" | "approved" | "rejected";
type AttendanceStatus = "available" | "maybe" | "unavailable" | "pending";
type EventType = "service" | "rehearsal" | "meeting" | "special_event";
type EventApprovalStatus = "pending" | "approved" | "rejected";
type SongEditStatus = "pending" | "approved" | "rejected";
type NoticePriority = "normal" | "important" | "urgent";
type ReminderRecurrence = "none" | "weekly" | "monthly";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          code: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          code?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_settings: {
        Row: {
          team_id: string;
          notification_preferences: string[];
          default_service_location: string;
          default_call_time: string;
          default_rehearsal_time: string;
          dashboard_widgets: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          team_id: string;
          notification_preferences?: string[];
          default_service_location?: string;
          default_call_time?: string;
          default_rehearsal_time?: string;
          dashboard_widgets?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          notification_preferences?: string[];
          default_service_location?: string;
          default_call_time?: string;
          default_rehearsal_time?: string;
          dashboard_widgets?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      service_templates: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          service_type: string;
          location: string;
          call_time: string;
          rehearsal_time: string;
          reminder_frequency: ReminderRecurrence;
          reminder_occurrences: number;
          default_roles: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          service_type?: string;
          location?: string;
          call_time?: string;
          rehearsal_time?: string;
          reminder_frequency?: ReminderRecurrence;
          reminder_occurrences?: number;
          default_roles?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          service_type?: string;
          location?: string;
          call_time?: string;
          rehearsal_time?: string;
          reminder_frequency?: ReminderRecurrence;
          reminder_occurrences?: number;
          default_roles?: Json;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          profile_id: string;
          role: TeamRole;
          status: MemberStatus;
          ministry: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          profile_id: string;
          role?: TeamRole;
          status?: MemberStatus;
          ministry?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: TeamRole;
          status?: MemberStatus;
          ministry?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_invitations: {
        Row: {
          id: string;
          team_id: string;
          email: string;
          role: TeamRole;
          message: string | null;
          status: string;
          invited_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          email: string;
          role?: TeamRole;
          message?: string | null;
          status?: string;
          invited_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role?: TeamRole;
          message?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      join_requests: {
        Row: {
          id: string;
          team_id: string;
          profile_id: string;
          requested_role: TeamRole;
          status: JoinRequestStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          profile_id: string;
          requested_role?: TeamRole;
          status?: JoinRequestStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          requested_role?: TeamRole;
          status?: JoinRequestStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      announcements: {
        Row: {
          id: string;
          team_id: string;
          category: string;
          title: string;
          body: string;
          target_role: TeamRole | null;
          target_profile_id: string | null;
          target_label: string;
          priority: NoticePriority;
          event_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          category: string;
          title: string;
          body: string;
          target_role?: TeamRole | null;
          target_profile_id?: string | null;
          target_label?: string;
          priority?: NoticePriority;
          event_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          title?: string;
          body?: string;
          target_role?: TeamRole | null;
          target_profile_id?: string | null;
          target_label?: string;
          priority?: NoticePriority;
          event_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      announcement_receipts: {
        Row: {
          announcement_id: string;
          team_id: string;
          profile_id: string;
          delivered_at: string;
          read_at: string | null;
          acknowledged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          announcement_id: string;
          team_id: string;
          profile_id: string;
          delivered_at?: string;
          read_at?: string | null;
          acknowledged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          delivered_at?: string;
          read_at?: string | null;
          acknowledged_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          team_id: string;
          type: EventType;
          name: string;
          event_date: string;
          starts_at: string;
          ends_at: string | null;
          location: string | null;
          description: string | null;
          call_time: string | null;
          rehearsal_time: string | null;
          approval_status: EventApprovalStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          type: EventType;
          name: string;
          event_date: string;
          starts_at: string;
          ends_at?: string | null;
          location?: string | null;
          description?: string | null;
          call_time?: string | null;
          rehearsal_time?: string | null;
          approval_status?: EventApprovalStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          type?: EventType;
          name?: string;
          event_date?: string;
          starts_at?: string;
          ends_at?: string | null;
          location?: string | null;
          description?: string | null;
          call_time?: string | null;
          rehearsal_time?: string | null;
          approval_status?: EventApprovalStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      songs: {
        Row: {
          id: string;
          team_id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number;
          time_signature: string;
          lyrics_chords: string;
          nashville_numbers: string | null;
          youtube_url: string | null;
          spotify_url: string | null;
          tags: string[];
          status: SongEditStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number;
          time_signature?: string;
          lyrics_chords: string;
          nashville_numbers?: string | null;
          youtube_url?: string | null;
          spotify_url?: string | null;
          tags?: string[];
          status?: SongEditStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          artist?: string;
          original_key?: string;
          bpm?: number;
          time_signature?: string;
          lyrics_chords?: string;
          nashville_numbers?: string | null;
          youtube_url?: string | null;
          spotify_url?: string | null;
          tags?: string[];
          status?: SongEditStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      song_favorites: {
        Row: {
          song_id: string;
          team_member_id: string;
          created_at: string;
        };
        Insert: {
          song_id: string;
          team_member_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      setlists: {
        Row: {
          id: string;
          team_id: string;
          event_id: string | null;
          name: string;
          setlist_date: string;
          location: string | null;
          call_time: string | null;
          rehearsal_time: string | null;
          service_times: string[];
          leader_member_id: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          event_id?: string | null;
          name: string;
          setlist_date: string;
          location?: string | null;
          call_time?: string | null;
          rehearsal_time?: string | null;
          service_times?: string[];
          leader_member_id?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string | null;
          name?: string;
          setlist_date?: string;
          location?: string | null;
          call_time?: string | null;
          rehearsal_time?: string | null;
          service_times?: string[];
          leader_member_id?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      setlist_songs: {
        Row: {
          id: string;
          setlist_id: string;
          song_id: string;
          song_order: number;
          assigned_key: string;
          lead_member_id: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          setlist_id: string;
          song_id: string;
          song_order: number;
          assigned_key: string;
          lead_member_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          song_order?: number;
          assigned_key?: string;
          lead_member_id?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      setlist_change_log: {
        Row: {
          id: string;
          setlist_id: string;
          team_id: string;
          changed_by: string | null;
          change_type: "created" | "updated" | "song_added" | "song_removed" | "song_reordered";
          summary: string;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          setlist_id: string;
          team_id: string;
          changed_by?: string | null;
          change_type: "created" | "updated" | "song_added" | "song_removed" | "song_reordered";
          summary: string;
          snapshot?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          event_id: string;
          team_member_id: string;
          status: AttendanceStatus;
          note: string | null;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          team_member_id: string;
          status?: AttendanceStatus;
          note?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: AttendanceStatus;
          note?: string | null;
          responded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_files: {
        Row: {
          id: string;
          team_id: string;
          song_id: string | null;
          event_id: string | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          song_id?: string | null;
          event_id?: string | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      message_channels: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          channel_type: "team" | "group" | "direct";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          channel_type?: "team" | "group" | "direct";
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          channel_type?: "team" | "group" | "direct";
          updated_at?: string;
        };
        Relationships: [];
      };
      message_channel_members: {
        Row: {
          id: string;
          channel_id: string;
          team_member_id: string;
          muted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          team_member_id: string;
          muted_at?: string | null;
          created_at?: string;
        };
        Update: {
          muted_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_member_id: string;
          body: string;
          attachment_file_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          sender_member_id: string;
          body: string;
          attachment_file_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          attachment_file_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          team_id: string;
          profile_id: string;
          title: string;
          body: string | null;
          target_path: string | null;
          target_role: TeamRole | null;
          target_profile_id: string | null;
          target_label: string;
          acknowledged_at: string | null;
          priority: NoticePriority;
          event_id: string | null;
          scheduled_for: string;
          recurrence_rule: ReminderRecurrence;
          recurrence_index: number;
          recurrence_total: number;
          notice_group_id: string | null;
          created_by: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          profile_id: string;
          title: string;
          body?: string | null;
          target_path?: string | null;
          target_role?: TeamRole | null;
          target_profile_id?: string | null;
          target_label?: string;
          acknowledged_at?: string | null;
          priority?: NoticePriority;
          event_id?: string | null;
          scheduled_for?: string;
          recurrence_rule?: ReminderRecurrence;
          recurrence_index?: number;
          recurrence_total?: number;
          notice_group_id?: string | null;
          created_by?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
          acknowledged_at?: string | null;
          target_path?: string | null;
          target_role?: TeamRole | null;
          target_profile_id?: string | null;
          target_label?: string;
          priority?: NoticePriority;
          event_id?: string | null;
          scheduled_for?: string;
          recurrence_rule?: ReminderRecurrence;
          recurrence_index?: number;
          recurrence_total?: number;
          notice_group_id?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_team_workspace: {
        Args: {
          p_name: string;
          p_code: string;
          p_default_service_location?: string;
          p_default_call_time?: string;
          p_default_rehearsal_time?: string;
        };
        Returns: {
          team_id: string;
          team_member_id: string;
          channel_id: string;
        }[];
      };
      delete_team_workspace: {
        Args: {
          p_team_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      team_role: TeamRole;
      member_status: MemberStatus;
      join_request_status: JoinRequestStatus;
      attendance_status: AttendanceStatus;
      event_type: EventType;
      song_edit_status: SongEditStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
