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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          profile_id: string
          target_id: string | null
          target_type: string
          team_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          profile_id: string
          target_id?: string | null
          target_type: string
          team_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          profile_id?: string
          target_id?: string | null
          target_type?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_receipts: {
        Row: {
          acknowledged_at: string | null
          announcement_id: string
          created_at: string
          delivered_at: string
          profile_id: string
          read_at: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          announcement_id: string
          created_at?: string
          delivered_at?: string
          profile_id: string
          read_at?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          announcement_id?: string
          created_at?: string
          delivered_at?: string
          profile_id?: string
          read_at?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_receipts_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_receipts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string
          event_id: string | null
          id: string
          is_pinned: boolean | null
          priority: string
          target_label: string
          target_profile_id: string | null
          target_role: Database["public"]["Enums"]["team_role"] | null
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          created_by: string
          event_id?: string | null
          id?: string
          is_pinned?: boolean | null
          priority?: string
          target_label?: string
          target_profile_id?: string | null
          target_role?: Database["public"]["Enums"]["team_role"] | null
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string
          event_id?: string | null
          id?: string
          is_pinned?: boolean | null
          priority?: string
          target_label?: string
          target_profile_id?: string | null
          target_role?: Database["public"]["Enums"]["team_role"] | null
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          event_id: string
          id: string
          note: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          team_member_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          note?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          team_member_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          note?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string | null
          id: string
          name: string
          permissions: string[]
          team_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          permissions?: string[]
          team_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          permissions?: string[]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      dance_notes: {
        Row: {
          choreography_notes: string | null
          created_at: string
          created_by: string
          event_id: string | null
          formation_notes: string | null
          id: string
          outfit_notes: string | null
          song_artist: string | null
          song_id: string | null
          song_title: string | null
          song_version: string | null
          team_id: string
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          choreography_notes?: string | null
          created_at?: string
          created_by: string
          event_id?: string | null
          formation_notes?: string | null
          id?: string
          outfit_notes?: string | null
          song_artist?: string | null
          song_id?: string | null
          song_title?: string | null
          song_version?: string | null
          team_id: string
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          choreography_notes?: string | null
          created_at?: string
          created_by?: string
          event_id?: string | null
          formation_notes?: string | null
          id?: string
          outfit_notes?: string | null
          song_artist?: string | null
          song_id?: string | null
          song_title?: string | null
          song_version?: string | null
          team_id?: string
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dance_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_notes_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dance_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_assignments: {
        Row: {
          assignment: string
          created_at: string
          event_id: string
          id: string
          team_member_id: string
        }
        Insert: {
          assignment: string
          created_at?: string
          event_id: string
          id?: string
          team_member_id: string
        }
        Update: {
          assignment?: string
          created_at?: string
          event_id?: string
          id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approval_status: string
          call_time: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          event_date: string
          id: string
          location: string | null
          name: string
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          rehearsal_date: string | null
          rehearsal_end_time: string | null
          rehearsal_time: string | null
          service_type: string | null
          starts_at: string
          sync_revision: number
          team_id: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
        }
        Insert: {
          approval_status?: string
          call_time?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          event_date: string
          id?: string
          location?: string | null
          name: string
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          rehearsal_date?: string | null
          rehearsal_end_time?: string | null
          rehearsal_time?: string | null
          service_type?: string | null
          starts_at: string
          sync_revision?: number
          team_id: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Update: {
          approval_status?: string
          call_time?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          event_date?: string
          id?: string
          location?: string | null
          name?: string
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          rehearsal_date?: string | null
          rehearsal_end_time?: string | null
          rehearsal_time?: string | null
          service_type?: string | null
          starts_at?: string
          sync_revision?: number
          team_id?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          page_url: string
          profile_id: string
          report_type: string
          team_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          page_url?: string
          profile_id: string
          report_type: string
          team_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          page_url?: string
          profile_id?: string
          report_type?: string
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          requested_role: Database["public"]["Enums"]["team_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          requested_role?: Database["public"]["Enums"]["team_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          requested_role?: Database["public"]["Enums"]["team_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      message_channel_members: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          muted_at: string | null
          team_member_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          muted_at?: string | null
          team_member_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          muted_at?: string | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_channel_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      message_channels: {
        Row: {
          avatar_url: string | null
          channel_type: string
          created_at: string
          created_by: string
          id: string
          name: string
          team_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          channel_type?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          team_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          channel_type?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          message_id: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          message_id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_file_id: string | null
          body: string
          channel_id: string
          created_at: string
          id: string
          is_delivered: boolean
          parent_message_id: string | null
          scheduled_for: string | null
          sender_member_id: string
          updated_at: string
        }
        Insert: {
          attachment_file_id?: string | null
          body: string
          channel_id: string
          created_at?: string
          id?: string
          is_delivered?: boolean
          parent_message_id?: string | null
          scheduled_for?: string | null
          sender_member_id: string
          updated_at?: string
        }
        Update: {
          attachment_file_id?: string | null
          body?: string
          channel_id?: string
          created_at?: string
          id?: string
          is_delivered?: boolean
          parent_message_id?: string | null
          scheduled_for?: string | null
          sender_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_attachment_file_id_fkey"
            columns: ["attachment_file_id"]
            isOneToOne: false
            referencedRelation: "practice_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_member_id_fkey"
            columns: ["sender_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_schedules: {
        Row: {
          created_at: string
          created_by: string
          id: string
          schedule: Json
          schedule_month: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          schedule?: Json
          schedule_month: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          schedule?: Json
          schedule_month?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_schedules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          acknowledged_at: string | null
          body: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          notice_group_id: string | null
          priority: string
          profile_id: string
          read_at: string | null
          recurrence_index: number
          recurrence_rule: string
          recurrence_total: number
          scheduled_for: string
          target_label: string
          target_path: string | null
          target_profile_id: string | null
          target_role: Database["public"]["Enums"]["team_role"] | null
          team_id: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          notice_group_id?: string | null
          priority?: string
          profile_id: string
          read_at?: string | null
          recurrence_index?: number
          recurrence_rule?: string
          recurrence_total?: number
          scheduled_for?: string
          target_label?: string
          target_path?: string | null
          target_profile_id?: string | null
          target_role?: Database["public"]["Enums"]["team_role"] | null
          team_id: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          notice_group_id?: string | null
          priority?: string
          profile_id?: string
          read_at?: string | null
          recurrence_index?: number
          recurrence_rule?: string
          recurrence_total?: number
          scheduled_for?: string
          target_label?: string
          target_path?: string | null
          target_profile_id?: string | null
          target_role?: Database["public"]["Enums"]["team_role"] | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_files: {
        Row: {
          created_at: string
          event_id: string | null
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          song_id: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          song_id?: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          song_id?: string | null
          storage_path?: string
          team_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_files_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_files_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_files_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          team_id: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          team_id: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          team_id?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_assets: {
        Row: {
          asset_type: string
          byte_size: number
          created_at: string
          deleted_at: string | null
          id: string
          sha256: string | null
          storage_path: string
          sync_revision: number
          team_id: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          sha256?: string | null
          storage_path: string
          sync_revision?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          byte_size?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          sha256?: string | null
          storage_path?: string
          sync_revision?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presentation_assets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthday: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          subscription: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          subscription: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          subscription?: Json
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_templates: {
        Row: {
          call_time: string
          created_at: string
          created_by: string | null
          default_roles: Json
          id: string
          location: string
          name: string
          rehearsal_time: string
          reminder_frequency: string
          reminder_occurrences: number
          service_type: string
          team_id: string
          updated_at: string
        }
        Insert: {
          call_time?: string
          created_at?: string
          created_by?: string | null
          default_roles?: Json
          id?: string
          location?: string
          name: string
          rehearsal_time?: string
          reminder_frequency?: string
          reminder_occurrences?: number
          service_type?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          call_time?: string
          created_at?: string
          created_by?: string | null
          default_roles?: Json
          id?: string
          location?: string
          name?: string
          rehearsal_time?: string
          reminder_frequency?: string
          reminder_occurrences?: number
          service_type?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_change_log: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          setlist_id: string
          snapshot: Json
          summary: string
          team_id: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          id?: string
          setlist_id: string
          snapshot?: Json
          summary: string
          team_id: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          setlist_id?: string
          snapshot?: Json
          summary?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_change_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_change_log_setlist_id_fkey"
            columns: ["setlist_id"]
            isOneToOne: false
            referencedRelation: "setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_change_log_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_songs: {
        Row: {
          arrangement: string | null
          arrangement_sections: Json | null
          assigned_key: string
          band_notes: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lead_member_id: string | null
          notes: string | null
          setlist_id: string
          slide_settings: Json | null
          song_id: string
          song_order: number
          sync_revision: number
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          arrangement?: string | null
          arrangement_sections?: Json | null
          assigned_key: string
          band_notes?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_member_id?: string | null
          notes?: string | null
          setlist_id: string
          slide_settings?: Json | null
          song_id: string
          song_order: number
          sync_revision?: number
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          arrangement?: string | null
          arrangement_sections?: Json | null
          assigned_key?: string
          band_notes?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lead_member_id?: string | null
          notes?: string | null
          setlist_id?: string
          slide_settings?: Json | null
          song_id?: string
          song_order?: number
          sync_revision?: number
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setlist_songs_lead_member_id_fkey"
            columns: ["lead_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_songs_setlist_id_fkey"
            columns: ["setlist_id"]
            isOneToOne: false
            referencedRelation: "setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          slots: Json
          team_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slots?: Json
          team_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slots?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      setlists: {
        Row: {
          call_time: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          event_id: string | null
          id: string
          leader_member_id: string | null
          location: string | null
          name: string
          notes: string | null
          presentation_settings: Json | null
          rehearsal_time: string | null
          service_times: string[]
          setlist_date: string
          sync_revision: number
          team_id: string
          updated_at: string
        }
        Insert: {
          call_time?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          event_id?: string | null
          id?: string
          leader_member_id?: string | null
          location?: string | null
          name: string
          notes?: string | null
          presentation_settings?: Json | null
          rehearsal_time?: string | null
          service_times?: string[]
          setlist_date: string
          sync_revision?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          call_time?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          event_id?: string | null
          id?: string
          leader_member_id?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          presentation_settings?: Json | null
          rehearsal_time?: string | null
          service_times?: string[]
          setlist_date?: string
          sync_revision?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlists_leader_member_id_fkey"
            columns: ["leader_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlists_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      song_edit_requests: {
        Row: {
          created_at: string
          id: string
          proposed_artist: string | null
          proposed_bpm: number | null
          proposed_key: string | null
          proposed_lyrics_chords: string | null
          proposed_title: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          song_id: string
          status: Database["public"]["Enums"]["song_edit_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_artist?: string | null
          proposed_bpm?: number | null
          proposed_key?: string | null
          proposed_lyrics_chords?: string | null
          proposed_title?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          song_id: string
          status?: Database["public"]["Enums"]["song_edit_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_artist?: string | null
          proposed_bpm?: number | null
          proposed_key?: string | null
          proposed_lyrics_chords?: string | null
          proposed_title?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          song_id?: string
          status?: Database["public"]["Enums"]["song_edit_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_edit_requests_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_edit_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      song_favorites: {
        Row: {
          created_at: string
          song_id: string
          team_member_id: string
        }
        Insert: {
          created_at?: string
          song_id: string
          team_member_id: string
        }
        Update: {
          created_at?: string
          song_id?: string
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_favorites_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_favorites_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      song_versions: {
        Row: {
          change_note: string | null
          changed_by: string
          created_at: string
          id: string
          lyrics_chords: string
          song_id: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          changed_by: string
          created_at?: string
          id?: string
          lyrics_chords: string
          song_id: string
          version_number: number
        }
        Update: {
          change_note?: string | null
          changed_by?: string
          created_at?: string
          id?: string
          lyrics_chords?: string
          song_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_versions_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          album: string | null
          artist: string
          bpm: number | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          image_url: string | null
          lyrics_chords: string
          nashville_numbers: string | null
          original_key: string
          seed_source: string | null
          spotify_url: string | null
          status: Database["public"]["Enums"]["song_edit_status"]
          sync_revision: number
          tags: string[]
          team_id: string
          time_signature: string
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          album?: string | null
          artist: string
          bpm?: number | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          lyrics_chords: string
          nashville_numbers?: string | null
          original_key: string
          seed_source?: string | null
          spotify_url?: string | null
          status?: Database["public"]["Enums"]["song_edit_status"]
          sync_revision?: number
          tags?: string[]
          team_id: string
          time_signature?: string
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          album?: string | null
          artist?: string
          bpm?: number | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          lyrics_chords?: string
          nashville_numbers?: string | null
          original_key?: string
          seed_source?: string | null
          spotify_url?: string | null
          status?: Database["public"]["Enums"]["song_edit_status"]
          sync_revision?: number
          tags?: string[]
          team_id?: string
          time_signature?: string
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "songs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          message: string | null
          role: Database["public"]["Enums"]["team_role"]
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          message?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          message?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          custom_role_id: string | null
          id: string
          ministries: string[] | null
          ministry: string | null
          profile_id: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["member_status"]
          team_anniversary: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_role_id?: string | null
          id?: string
          ministries?: string[] | null
          ministry?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_anniversary?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_role_id?: string | null
          id?: string
          ministries?: string[] | null
          ministry?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["member_status"]
          team_anniversary?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_role_permissions: {
        Row: {
          created_at: string
          id: string
          permissions: string[]
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: string[]
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: string[]
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_role_permissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_role_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_settings: {
        Row: {
          created_at: string
          dashboard_widgets: string[]
          default_call_time: string
          default_rehearsal_time: string
          default_service_location: string
          notification_preferences: string[]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_widgets?: string[]
          default_call_time?: string
          default_rehearsal_time?: string
          default_service_location?: string
          notification_preferences?: string[]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_widgets?: string[]
          default_call_time?: string
          default_rehearsal_time?: string
          default_service_location?: string
          notification_preferences?: string[]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_annotations: {
        Row: {
          canvas_data: string | null
          created_at: string
          id: string
          profile_id: string
          setlist_song_id: string
          updated_at: string
        }
        Insert: {
          canvas_data?: string | null
          created_at?: string
          id?: string
          profile_id: string
          setlist_song_id: string
          updated_at?: string
        }
        Update: {
          canvas_data?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          setlist_song_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_annotations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_annotations_setlist_song_id_fkey"
            columns: ["setlist_song_id"]
            isOneToOne: false
            referencedRelation: "setlist_songs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string
          id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worship_remote_pairing_sessions: {
        Row: {
          channel_secret: string
          claim_expires_at: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          paired_by: string | null
          pairing_code_hash: string
          pin_code_hash: string | null
          revoked_at: string | null
          setlist_id: string
          team_id: string
        }
        Insert: {
          channel_secret: string
          claim_expires_at?: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          paired_by?: string | null
          pairing_code_hash: string
          pin_code_hash?: string | null
          revoked_at?: string | null
          setlist_id: string
          team_id: string
        }
        Update: {
          channel_secret?: string
          claim_expires_at?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          paired_by?: string | null
          pairing_code_hash?: string
          pin_code_hash?: string | null
          revoked_at?: string | null
          setlist_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_remote_pairing_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_remote_pairing_sessions_paired_by_fkey"
            columns: ["paired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_remote_pairing_sessions_setlist_id_fkey"
            columns: ["setlist_id"]
            isOneToOne: false
            referencedRelation: "setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worship_remote_pairing_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_sync_changes: {
        Row: {
          created_at: string
          cursor: number
          entity_id: string
          entity_type: string
          operation: string
          payload: Json
          revision: number
          team_id: string
        }
        Insert: {
          created_at?: string
          cursor?: never
          entity_id: string
          entity_type: string
          operation: string
          payload?: Json
          revision: number
          team_id: string
        }
        Update: {
          created_at?: string
          cursor?: never
          entity_id?: string
          entity_type?: string
          operation?: string
          payload?: Json
          revision?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_sync_changes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      worship_sync_receipts: {
        Row: {
          created_at: string
          device_id: string
          mutation_id: string
          result: Json
          team_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          mutation_id: string
          result: Json
          team_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          mutation_id?: string
          result?: Json
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worship_sync_receipts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_setlist_songs: {
        Args: { p_setlist_id: string; p_songs: Json }
        Returns: number
      }
      apply_worship_mutation: {
        Args: {
          p_base_revision?: number
          p_command: string
          p_device_id: string
          p_mutation_id: string
          p_payload: Json
        }
        Returns: Json
      }
      bootstrap_worship_cache: { Args: never; Returns: Json }
      claim_worship_remote_pairing: {
        Args: { p_pairing_code: string; p_session_id: string }
        Returns: {
          channel_secret: string
          channel_topic: string
          expires_at: string
          private_channel: boolean
          session_id: string
          setlist_id: string
          team_id: string
        }[]
      }
      claim_worship_remote_pairing_by_pin: {
        Args: { p_pin_code: string }
        Returns: {
          channel_topic: string | null
          error_code: string | null
          expires_at: string | null
          private_channel: boolean | null
          session_id: string | null
          setlist_id: string | null
          team_id: string | null
        }[]
      }
      create_worship_remote_pairing: {
        Args: { p_setlist_id: string }
        Returns: {
          channel_topic: string
          claim_expires_at: string
          expires_at: string
          pin_code: string
          private_channel: boolean
          qr_token: string
          session_id: string
        }[]
      }
      create_team_workspace: {
        Args: {
          p_code: string
          p_default_call_time?: string
          p_default_rehearsal_time?: string
          p_default_service_location?: string
          p_name: string
        }
        Returns: {
          channel_id: string
          team_id: string
          team_member_id: string
        }[]
      }
      delete_event_cascade: { Args: { p_event_id: string }; Returns: undefined }
      delete_setlist_cascade: {
        Args: { p_setlist_id: string }
        Returns: undefined
      }
      delete_song_cascade: { Args: { p_song_id: string }; Returns: undefined }
      delete_team_workspace: { Args: { p_team_id: string }; Returns: undefined }
      deliver_scheduled_messages: {
        Args: { batch_size?: number }
        Returns: {
          id: string
        }[]
      }
      get_unread_message_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      leave_team_workspace: { Args: { p_team_id: string }; Returns: undefined }
      link_event_setlist: {
        Args: { p_event_id: string; p_setlist_id?: string | null }
        Returns: undefined
      }
      mark_channel_messages_read: {
        Args: { p_channel_id: string; p_message_ids: string[] }
        Returns: number
      }
      pull_worship_changes: { Args: { after_cursor?: number }; Returns: Json }
      reorder_setlist_songs: {
        Args: { p_setlist_id: string; p_updates: Json }
        Returns: number
      }
      review_join_request: {
        Args: { p_decision: string; p_request_id: string }
        Returns: string
      }
      resume_worship_remote_pairing: {
        Args: { p_session_id: string }
        Returns: {
          channel_topic: string
          expires_at: string
          private_channel: boolean
          session_id: string
          setlist_id: string
          team_id: string
        }[]
      }
      revoke_worship_remote_pairing: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      transfer_team_ownership: {
        Args: { p_new_owner_member_id: string; p_team_id: string }
        Returns: undefined
      }
    }
    Enums: {
      attendance_status: "available" | "maybe" | "unavailable" | "pending"
      event_type:
        | "service"
        | "rehearsal"
        | "meeting"
        | "special_event"
        | "service_rehearsal"
      join_request_status: "pending" | "approved" | "rejected" | "canceled"
      member_status: "active" | "inactive"
      song_edit_status: "pending" | "approved" | "rejected"
      team_role:
        | "owner"
        | "admin"
        | "pastor"
        | "worship_leader"
        | "band_leader"
        | "band_member"
        | "dancer"
        | "media"
        | "member"
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
      attendance_status: ["available", "maybe", "unavailable", "pending"],
      event_type: [
        "service",
        "rehearsal",
        "meeting",
        "special_event",
        "service_rehearsal",
      ],
      join_request_status: ["pending", "approved", "rejected", "canceled"],
      member_status: ["active", "inactive"],
      song_edit_status: ["pending", "approved", "rejected"],
      team_role: [
        "owner",
        "admin",
        "pastor",
        "worship_leader",
        "band_leader",
        "band_member",
        "dancer",
        "media",
        "member",
      ],
    },
  },
} as const
