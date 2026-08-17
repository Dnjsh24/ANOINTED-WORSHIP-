"use client";

import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Menu,
  MoreHorizontal,
  Music,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Settings2,
  Smile,
  SquarePen,
  ThumbsUp,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addChannelMemberAction,
  createChannelAction,
  getOrCreateDirectChannelAction,
  leaveChannelAction,
  markMessagesReadAction,
  removeChannelMemberAction,
  sendMessageAction,
} from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import {
  fileKindLabel,
  formatFileSize,
  inferPracticeFileMimeType,
  isImageMimeType,
  storagePath,
  validatePracticeFile,
} from "@/lib/domain/files";
import { createOptionalClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

function generateObjectId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `obj-${Math.random().toString(36).slice(2, 11)}`;
}

export type MessagesChannel = {
  id: string;
  name: string;
  type?: string;
  membersOnline: number;
  preview: string;
  messages: Message[];
  adminOnly?: boolean;
  avatarUrl?: string | null;
};

export type MessagesTeamMember = {
  memberId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
};

export type MessagesChannelMembership = {
  channelId: string;
  memberId: string;
};

const QUICK_REACTION_EMOJIS = ["❤️", "👍", "🔥", "🙏", "😂", "😮"];
const EMOJI_PALETTE = ["🙏", "🙌", "🎶", "✅", "❤️", "👍", "🔥", "😂", "😮", "✨"];

type AttachmentDetails = NonNullable<Message["attachment"]>;

type PendingAttachment = {
  file: File;
  previewUrl?: string;
  details: AttachmentDetails;
};

function attachmentHref(attachment: AttachmentDetails) {
  return attachment.url || `/practice-files/${attachment.name}`;
}

export function MessagesClient({
  channels,
  teamMembers = [],
  currentMemberId,
  currentProfileId,
  teamId,
  role,
  allChannelMemberships = [],
}: {
  channels: MessagesChannel[];
  teamMembers?: MessagesTeamMember[];
  currentMemberId: string;
  currentProfileId: string;
  teamId: string;
  role: string;
  allChannelMemberships?: MessagesChannelMembership[];
}) {
  const router = useRouter();
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || "");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [channelList, setChannelList] = useState(channels);
  const [previousChannels, setPreviousChannels] = useState(channels);
  const [memberships, setMemberships] = useState<MessagesChannelMembership[]>(allChannelMemberships);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<PendingAttachment | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [managingChannelId, setManagingChannelId] = useState<string | null>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [messageOptionsOpenId, setMessageOptionsOpenId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [onlineMemberIds, setOnlineMemberIds] = useState<string[]>([]);

  // Close mobile sidebar on Escape
  useEffect(() => {
    if (!sidebarExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarExpanded]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (selectedAttachment?.previewUrl) {
        URL.revokeObjectURL(selectedAttachment.previewUrl);
      }
    };
  }, [selectedAttachment]);

  // Online presence tracking
  useEffect(() => {
    const supabase = createOptionalClient();
    if (!supabase) return;
    const presenceChannel = supabase.channel(`online-presence-${activeChannelId}`, {
      config: { presence: { key: currentMemberId } },
    });

    if (presenceChannel && (presenceChannel.state === "joined" || presenceChannel.state === "joining")) {
      presenceChannel.unsubscribe();
    }

    try {
      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState();
          const onlineIds = Object.keys(state);
          setOnlineMemberIds(onlineIds);
        })
        .subscribe(async (subStatus) => {
          if (subStatus === "SUBSCRIBED") {
            await presenceChannel.track({
              online_at: new Date().toISOString(),
              member_id: currentMemberId,
            });
          }
        });
    } catch (err) {
      console.warn("Messages presence channel recovery...", err);
      presenceChannel.unsubscribe();
      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState();
          const onlineIds = Object.keys(state);
          setOnlineMemberIds(onlineIds);
        })
        .subscribe(async (subStatus) => {
          if (subStatus === "SUBSCRIBED") {
            await presenceChannel.track({
              online_at: new Date().toISOString(),
              member_id: currentMemberId,
            });
          }
        });
    }

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [activeChannelId, currentMemberId]);

  const teamMembersRef = useRef(teamMembers);
  useEffect(() => {
    teamMembersRef.current = teamMembers;
  }, [teamMembers]);

  const channelListRef = useRef(channelList);
  useEffect(() => {
    channelListRef.current = channelList;
  }, [channelList]);

  const currentMemberIdRef = useRef(currentMemberId);
  useEffect(() => {
    currentMemberIdRef.current = currentMemberId;
  }, [currentMemberId]);

  // Real-time message inserts
  useEffect(() => {
    const supabase = createOptionalClient();
    if (!supabase) return;

    const realtimeChannel = supabase
      .channel("messages-realtime", { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            channel_id: string;
            sender_member_id: string;
            body: string;
            attachment_file_id: string | null;
            parent_message_id: string | null;
            created_at: string;
          };

          const sender = teamMembersRef.current.find(
            (m) => m.memberId === newMessage.sender_member_id
          );
          const mine = newMessage.sender_member_id === currentMemberIdRef.current;
          const authorName = mine ? "You" : sender ? sender.fullName : "Unknown Member";
          let attachment: AttachmentDetails | undefined;

          if (newMessage.attachment_file_id) {
            const { data: fileRecord } = await supabase
              .from("practice_files")
              .select("id, file_name, mime_type, size_bytes, storage_path")
              .eq("id", newMessage.attachment_file_id)
              .maybeSingle();

            if (fileRecord) {
              const { data: signedUrl } = await supabase.storage
                .from("practice-files")
                .createSignedUrl(fileRecord.storage_path, 60 * 60);

              attachment = {
                id: fileRecord.id,
                name: fileRecord.file_name,
                size: formatFileSize(Number(fileRecord.size_bytes)),
                type: fileKindLabel(fileRecord.mime_type, fileRecord.file_name),
                mimeType: fileRecord.mime_type,
                url: signedUrl?.signedUrl ?? "",
              };
            }
          }

          const formattedMessage: Message = {
            id: newMessage.id,
            author: authorName,
            body: newMessage.body,
            avatarUrl: sender?.avatarUrl ?? null,
            createdAt: new Date(newMessage.created_at || Date.now()).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
            mine,
            attachment,
            parentMessageId: newMessage.parent_message_id || null,
          };

          const matchedChannel = channelListRef.current.some(
            (chan) => chan.id === newMessage.channel_id
          );
          setChannelList((current) =>
            current.map((chan) => {
              if (chan.id !== newMessage.channel_id) {
                return chan;
              }

              return {
                ...chan,
                preview: `${authorName}: ${newMessage.body}`,
                messages: chan.messages.some((m) => m.id === formattedMessage.id)
                  ? chan.messages
                  : [...chan.messages, formattedMessage],
              };
            })
          );

          if (!matchedChannel) {
            router.refresh();
          }

          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") {
          console.log("[Realtime] Connected to messages channel");
        } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
          setStatus("Live messages disconnected. Reconnecting when the network is ready.");
        }
      });

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [router]);

  if (channels !== previousChannels) {
    setPreviousChannels(channels);
    setChannelList(channels);
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }

  const activeChannel =
    channelList.find((channel) => channel.id === activeChannelId) ??
    channelList[0] ?? { id: "", name: "No Channel", membersOnline: 0, preview: "", messages: [] };
  const activeMessageCount = activeChannel.messages.length;

  // Auto scroll to bottom on message updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeChannelId, activeMessageCount]);

  // Mark unread messages as read
  useEffect(() => {
    if (!activeChannelId || activeChannel.messages.length === 0) return;
    const unreadMessageIds = activeChannel.messages
      .filter((msg) => !msg.mine && !msg.reads?.some((r) => r.profileId === currentProfileId))
      .map((msg) => msg.id);

    if (unreadMessageIds.length > 0) {
      startTransition(() => {
        markMessagesReadAction(activeChannelId, unreadMessageIds);
        setChannelList((prev) =>
          prev.map((c) => {
            if (c.id !== activeChannelId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (unreadMessageIds.includes(m.id)) {
                  return {
                    ...m,
                    reads: [...(m.reads || []), { profileId: currentProfileId, avatarUrl: null, fullName: "You" }],
                  };
                }
                return m;
              }),
            };
          })
        );
      });
    } else {
      startTransition(() => {
        markMessagesReadAction(activeChannelId, []);
      });
    }
  }, [activeChannel.messages, activeChannelId, activeMessageCount, currentProfileId]);

  const activeChannelFiles = useMemo(() => {
    const seen = new Set<string>();
    return (activeChannel.messages || [])
      .map((message) => message.attachment)
      .filter((attachment): attachment is AttachmentDetails => Boolean(attachment))
      .filter((attachment) => {
        const key = attachment.id ?? attachment.name;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }, [activeChannel.messages]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleChannels = channelList.filter((channel) =>
    `${channel.name} ${channel.preview}`.toLowerCase().includes(normalizedSearch)
  );
  const visibleMessages =
    activeChannel.messages?.filter((message) =>
      `${message.author} ${message.body} ${message.attachment?.name ?? ""}`
        .toLowerCase()
        .includes(normalizedSearch)
    ) || [];

  const visibleMembers = normalizedSearch
    ? teamMembers.filter(
        (m) =>
          m.memberId !== currentMemberId &&
          m.fullName.toLowerCase().includes(normalizedSearch)
      )
    : [];

  function updateChannelMessages(nextMessage: Message) {
    setChannelList((current) =>
      current.map((channel) =>
        channel.id === activeChannel.id
          ? {
              ...channel,
              preview: `${nextMessage.author}: ${nextMessage.body}`,
              messages: channel.messages.some((message) => message.id === nextMessage.id)
                ? channel.messages
                : [...channel.messages, nextMessage],
            }
          : channel
      )
    );
  }

  function clearSelectedAttachment() {
    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }
    setSelectedAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function handleAttachmentSelected(file: File | undefined, kind: "file" | "image") {
    if (!file) return;

    const validation = validatePracticeFile(file);
    if (!validation.valid) {
      setStatus(validation.reason ?? "This attachment is not supported.");
      clearSelectedAttachment();
      return;
    }

    const mimeType = inferPracticeFileMimeType(file);
    if (kind === "image" && !isImageMimeType(mimeType)) {
      setStatus("Choose a JPG or PNG picture.");
      clearSelectedAttachment();
      return;
    }

    if (selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(selectedAttachment.previewUrl);
    }

    const previewUrl = isImageMimeType(mimeType) ? URL.createObjectURL(file) : undefined;
    setSelectedAttachment({
      file,
      previewUrl,
      details: {
        name: file.name,
        size: formatFileSize(file.size),
        type: fileKindLabel(mimeType, file.name),
        mimeType,
        url: previewUrl,
      },
    });
    setAttachmentOpen(false);
    setStatus("Attachment ready.");
  }

  async function uploadSelectedAttachment(attachment: PendingAttachment): Promise<AttachmentDetails> {
    if (!teamId || !currentProfileId) {
      throw new Error("Sign in with Supabase to attach files.");
    }

    const supabase = createOptionalClient();
    if (!supabase) {
      throw new Error("Sign in with Supabase to attach files.");
    }
    const objectId = generateObjectId();
    const mimeType = inferPracticeFileMimeType(attachment.file);
    const path = storagePath(teamId, "messages", objectId, attachment.file.name);
    const { error: uploadError } = await supabase.storage
      .from("practice-files")
      .upload(path, attachment.file, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error("Attachment upload failed.");
    }

    const { data: fileRecord, error: recordError } = await supabase
      .from("practice_files")
      .insert({
        team_id: teamId,
        storage_path: path,
        file_name: attachment.file.name,
        mime_type: mimeType,
        size_bytes: attachment.file.size,
        uploaded_by: currentProfileId,
      })
      .select("id, file_name, mime_type, size_bytes, storage_path")
      .single();

    if (recordError || !fileRecord) {
      await supabase.storage.from("practice-files").remove([path]);
      throw new Error("Attachment could not be saved.");
    }

    const { data: signedUrl } = await supabase.storage
      .from("practice-files")
      .createSignedUrl(path, 60 * 60);

    return {
      id: fileRecord.id,
      name: fileRecord.file_name,
      size: formatFileSize(Number(fileRecord.size_bytes)),
      type: fileKindLabel(fileRecord.mime_type, fileRecord.file_name),
      mimeType: fileRecord.mime_type,
      url: signedUrl?.signedUrl ?? attachment.previewUrl,
    };
  }

  async function handleStartDirectMessage(otherMemberId: string) {
    const formData = new FormData();
    formData.set("otherMemberId", otherMemberId);

    startTransition(async () => {
      const result = await getOrCreateDirectChannelAction(formData);
      if (result.ok && result.data?.channelId) {
        const chanId = String(result.data.channelId);
        const exists = channelList.some((c) => c.id === chanId);
        if (!exists) {
          const member = teamMembers.find((m) => m.memberId === otherMemberId);
          const nextChannel: MessagesChannel = {
            id: chanId,
            name: member ? member.fullName : "Direct Message",
            membersOnline: 2,
            preview: "Start chatting!",
            messages: [],
          };
          setChannelList((current) => [...current, nextChannel]);
        }
        setActiveChannelId(chanId);
      } else {
        setStatus(result.message);
      }
    });
  }

  async function handleAddMember(channelId: string, memberId: string) {
    const formData = new FormData();
    formData.set("channelId", channelId);
    formData.set("memberId", memberId);

    startTransition(async () => {
      const result = await addChannelMemberAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setMemberships((prev) => [...prev, { channelId, memberId }]);
      }
    });
  }

  async function handleRemoveMember(channelId: string, memberId: string) {
    const formData = new FormData();
    formData.set("channelId", channelId);
    formData.set("memberId", memberId);

    startTransition(async () => {
      const result = await removeChannelMemberAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setMemberships((prev) =>
          prev.filter((m) => !(m.channelId === channelId && m.memberId === memberId))
        );
      }
    });
  }

  function sendMessageContent(customBody?: string, parentId?: string) {
    const pendingAttachment = selectedAttachment;
    const body = (customBody ?? draft).trim() || (pendingAttachment ? `Shared ${pendingAttachment.details.name}` : "");
    if (!body) return;

    startTransition(async () => {
      let uploadedAttachment: AttachmentDetails | undefined;

      try {
        if (pendingAttachment) {
          setStatus("Uploading attachment...");
          uploadedAttachment = await uploadSelectedAttachment(pendingAttachment);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Attachment upload failed.");
        return;
      }

      try {
        const formData = new FormData();
        formData.set("channelId", activeChannel.id);
        formData.set("body", body);
        if (uploadedAttachment?.id) {
          formData.set("attachmentFileId", uploadedAttachment.id);
        }
        if (scheduledFor) {
          formData.set("scheduledFor", new Date(scheduledFor).toISOString());
        }
        const effectiveParentId = parentId || replyingTo?.id;
        if (effectiveParentId) {
          formData.set("parentMessageId", effectiveParentId);
        }

        setStatus("Sending...");
        const result = await sendMessageAction(formData);

        if (result.ok) {
          if (!customBody) setDraft("");
          setScheduledFor("");
          setSelectedAttachment(null);
          setAttachmentOpen(false);
          setEmojiOpen(false);
          setReplyingTo(null);
          setStatus("Sent!");
          setTimeout(() => setStatus(""), 2000);

          const messageId =
            typeof result.data?.messageId === "string"
              ? result.data.messageId
              : `local-${generateObjectId()}`;
          const createdAtValue =
            typeof result.data?.createdAt === "string" ? result.data.createdAt : null;
          updateChannelMessages({
            id: messageId,
            author: "You",
            body,
            createdAt: createdAtValue
              ? new Date(createdAtValue).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Now",
            mine: true,
            attachment: uploadedAttachment,
            parentMessageId: effectiveParentId || null,
          });
          clearSelectedAttachment();
          setSearch("");
        } else {
          setStatus(result.message || "Message could not be sent.");
          setTimeout(() => setStatus(""), 4000);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to send message.");
        setTimeout(() => setStatus(""), 4000);
      }
    });
  }

  function sendQuickLike() {
    sendMessageContent("👍");
  }

  function handleReactToMessage(messageId: string, emoji: string) {
    sendMessageContent(emoji, messageId);
    setReactionPickerMessageId(null);
  }

  function createChannel(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
    if (!name) return;

    startTransition(async () => {
      const result = await createChannelAction(initialActionState, formData);
      setStatus(result.message);
      if (!result.ok) return;

      const nextChannel = {
        id: String(result.data?.channelId ?? name.toLowerCase().replaceAll(" ", "-")),
        name: String(result.data?.name ?? name),
        membersOnline: 1,
        preview: "New channel created",
        messages: [],
        avatarUrl: avatarUrl,
      };
      setChannelList((current) => [...current, nextChannel]);
      setActiveChannelId(nextChannel.id);
      setComposeOpen(false);
    });
  }

  async function leaveChannel() {
    const formData = new FormData();
    formData.set("channelId", activeChannel.id);
    const result = await leaveChannelAction(formData);
    setStatus(result.message);
  }

  // Active online members for top Messenger stories tray
  const onlineTeamMembers = useMemo(() => {
    if (onlineMemberIds.length === 0) return teamMembers.slice(0, 8);
    return teamMembers.filter((m) => onlineMemberIds.includes(m.memberId));
  }, [teamMembers, onlineMemberIds]);

  return (
    <div className="relative flex w-full max-w-full h-[calc(100dvh-120px-env(safe-area-inset-bottom))] md:h-[calc(100dvh-8rem)] min-h-[440px] md:min-h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e0d12] shadow-2xl backdrop-blur-xl">
      {/* ── Left Sidebar (Messenger Chats & Active Stories Tray) ── */}
      <aside
        className={cn(
          "transition-all duration-300 bg-[#16151a] flex flex-col border-r border-white/10 shrink-0 h-full overflow-y-auto absolute z-30 md:static md:translate-x-0 scrollbar-none",
          sidebarExpanded
            ? "w-80 p-4 translate-x-0 shadow-2xl"
            : "-translate-x-full w-80 md:w-20 md:p-3 lg:w-80 lg:p-4"
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className={cn("items-center gap-2", sidebarExpanded ? "flex" : "hidden lg:flex")}>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Chats</h1>
          </div>
          {role !== "member" && (
            <button
              type="button"
              aria-label="Compose new message"
              className={cn(
                "rounded-full p-2 text-violet-200 hover:bg-white/[0.08] hover:text-white transition active:scale-95 bg-white/[0.03]",
                !sidebarExpanded && "mx-auto lg:mx-0"
              )}
              onClick={() => {
                setComposeOpen((prev) => {
                  const next = !prev;
                  if (next) setSidebarExpanded(true);
                  return next;
                });
              }}
            >
              <SquarePen className="size-4.5" />
            </button>
          )}
        </div>

        {/* Inline Create Channel Form */}
        {composeOpen && (
          <form
            action={createChannel}
            className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left animate-in fade-in zoom-in-95 duration-200"
          >
            <p className="text-xs font-bold text-violet-300">New Channel</p>
            <Input name="name" placeholder="Channel name (e.g. Vocals)" required className="h-8 text-xs font-semibold rounded-lg" />
            <Input name="avatarUrl" placeholder="Icon / Avatar URL (Optional)" className="h-8 text-xs font-semibold rounded-lg" />
            <Button type="submit" disabled={isPending} className="w-full h-8 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500">
              Create Channel
            </Button>
          </form>
        )}

        {/* Messenger Pill Search */}
        <div className={cn("relative mt-3", sidebarExpanded ? "block" : "hidden lg:block")}>
          <div className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs text-zinc-300 focus-within:bg-white/[0.09] focus-within:ring-1 focus-within:ring-violet-500/50 border border-white/[0.06] transition">
            <Search className="size-4 text-zinc-400 shrink-0" />
            <input
              ref={searchInputRef}
              className="w-full bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none"
              placeholder="Search conversations..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-zinc-400 hover:text-white">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Messenger Active Users Horizontal Tray */}
        <div className={cn("mt-3.5 pb-2 border-b border-white/[0.06]", sidebarExpanded ? "block" : "hidden lg:block")}>
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none py-1 px-1">
            {onlineTeamMembers.map((member) => (
              <button
                key={member.memberId}
                type="button"
                onClick={() => {
                  handleStartDirectMessage(member.memberId);
                  if (window.innerWidth < 1024) setSidebarExpanded(false);
                }}
                className="group flex flex-col items-center gap-1 shrink-0 focus:outline-none"
                title={`Chat with ${member.fullName}`}
              >
                <div className="relative">
                  <Avatar
                    name={member.fullName}
                    src={member.avatarUrl}
                    className="size-11 rounded-full ring-2 ring-violet-500/40 group-hover:ring-violet-400 transition"
                  />
                  <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 ring-2 ring-[#16151a]" />
                </div>
                <span className="w-12 truncate text-center text-[10px] font-medium text-zinc-400 group-hover:text-zinc-200">
                  {member.fullName.split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Section Label */}
        <div className={cn("mt-3 flex items-center justify-between px-1", sidebarExpanded ? "block" : "hidden lg:block")}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">Channels</p>
          <span className="text-[10px] text-zinc-500">{visibleChannels.length}</span>
        </div>

        {/* Thin divider in collapsed view */}
        {!sidebarExpanded && <div className="mt-3 mb-1 mx-auto w-8 h-px bg-white/10 lg:hidden" />}

        {/* Channels List */}
        <div className="mt-2 space-y-1">
          {visibleChannels.map((channel) => {
            const isActive = channel.id === activeChannel.id;
            return (
              <button
                key={channel.id}
                type="button"
                className={cn(
                  "flex items-center gap-3 rounded-xl p-2 text-left w-full transition-all group",
                  isActive
                    ? "bg-violet-600/15 text-white shadow-sm border border-violet-500/20"
                    : "hover:bg-white/[0.04] text-zinc-300 hover:text-white",
                  sidebarExpanded ? "justify-start px-3" : "justify-center lg:justify-start lg:px-3"
                )}
                onClick={() => {
                  setActiveChannelId(channel.id);
                  if (window.innerWidth < 1024) {
                    setSidebarExpanded(false);
                  }
                }}
                title={channel.name}
              >
                <div className="relative shrink-0">
                  <Avatar name={channel.name} src={channel.avatarUrl} className="size-10 rounded-full" />
                  <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[#16151a]" />
                </div>
                <span className={cn(sidebarExpanded ? "block" : "hidden lg:block", "min-w-0 flex-1")}>
                  <span className="flex items-center justify-between">
                    <span className={cn("block text-xs font-bold truncate", isActive ? "text-violet-200" : "text-white")}>
                      {channel.name}
                    </span>
                  </span>
                  <span className="block max-w-44 truncate text-[11px] text-zinc-400 group-hover:text-zinc-300 mt-0.5">
                    {channel.preview}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Direct Messages Section when Searching */}
        {visibleMembers.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <p className={cn("font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1", sidebarExpanded ? "block" : "hidden lg:block")}>
              Direct Messages
            </p>
            <div className="mt-2 space-y-1">
              {visibleMembers.map((member) => (
                <button
                  key={member.memberId}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.05] transition w-full group",
                    sidebarExpanded ? "justify-start px-3" : "justify-center lg:justify-start lg:px-3"
                  )}
                  onClick={() => {
                    handleStartDirectMessage(member.memberId);
                    if (window.innerWidth < 1024) {
                      setSidebarExpanded(false);
                    }
                    setSearch("");
                  }}
                  title={member.fullName}
                >
                  <Avatar name={member.fullName} src={member.avatarUrl} className="size-9 rounded-full shrink-0" />
                  <span className={cn(sidebarExpanded ? "block" : "hidden lg:block", "min-w-0 flex-1")}>
                    <span className="block text-xs font-bold text-white truncate">{member.fullName}</span>
                    <span className="block text-[10px] text-zinc-400 capitalize">{member.role}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Backdrop Overlay */}
      {sidebarExpanded && (
        <div
          className="absolute inset-0 z-20 bg-black/50 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main Chat Screen (Center Stream) ── */}
      <section aria-label={`${activeChannel.name} conversation`} className="relative z-0 flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#100f14]">
        {/* Messenger Header Bar */}
        <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#16151a]/95 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden rounded-full p-2 text-zinc-300 hover:bg-white/[0.08] hover:text-white transition active:scale-95"
              onClick={() => setSidebarExpanded((prev) => !prev)}
              aria-label="Toggle message sidebar"
            >
              <Menu className="size-5" />
            </button>
            <div className="relative shrink-0">
              <Avatar name={activeChannel.name} src={activeChannel.avatarUrl} className="size-9.5 rounded-full" />
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[#16151a]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-white truncate">{activeChannel.name}</h2>
              <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5">
                <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {onlineMemberIds.length > 0 ? `${onlineMemberIds.length} active now` : `${activeChannel.membersOnline || 3} members`}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1 text-zinc-300">
            <button
              type="button"
              aria-label="Focus message search"
              className="rounded-full p-2 hover:bg-white/[0.08] hover:text-white transition active:scale-95"
              onClick={() => {
                setSidebarExpanded(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
            >
              <Search className="size-4.5" />
            </button>
            <button
              type="button"
              aria-label="Channel info"
              className={cn(
                "rounded-full p-2 hover:bg-white/[0.08] transition active:scale-95",
                infoPanelOpen ? "bg-violet-600/20 text-violet-300" : "hover:text-white"
              )}
              onClick={() => setInfoPanelOpen((value) => !value)}
            >
              <Info className="size-4.5" />
            </button>
          </div>
        </header>

        {/* Admin Manage Members Panel */}
        {managePanelOpen && managingChannelId && (
          <div className="border-b border-white/10 bg-[#17161c] px-5 py-3.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold text-violet-300">
                Manage Members — {channelList.find((c) => c.id === managingChannelId)?.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  setManagePanelOpen(false);
                  setManagingChannelId(null);
                }}
                className="rounded-full p-1 text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
              {teamMembers.map((member) => {
                const isMember = memberships.some(
                  (m) => m.channelId === managingChannelId && m.memberId === member.memberId
                );
                return (
                  <div key={member.memberId} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-1.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.fullName} src={member.avatarUrl} className="size-7 rounded-full" />
                      <div>
                        <p className="text-xs font-semibold text-white">{member.fullName}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">{member.role}</p>
                      </div>
                    </div>
                    {isMember ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleRemoveMember(managingChannelId, member.memberId)}
                        className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        <UserMinus className="size-3" /> Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAddMember(managingChannelId, member.memberId)}
                        className="flex items-center gap-1 rounded-lg border border-violet-500/40 px-2 py-1 text-[11px] font-bold text-violet-300 hover:bg-violet-500/10 transition disabled:opacity-50"
                      >
                        <UserPlus className="size-3" /> Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pinned Setlist Strip */}
        <Link
          href="/setlists/sunday-service"
          className="group flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 sm:px-6 py-2.5 transition hover:bg-white/[0.04]"
        >
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-600/20 text-violet-300 border-violet-500/30 text-[10px] px-2 py-0.5">
              Pinned
            </Badge>
            <p className="text-xs font-semibold text-zinc-300 group-hover:text-white transition truncate">
              Sunday Worship Setlist • Active Songs & Notes
            </p>
          </div>
          <span className="text-[11px] font-medium text-violet-300 group-hover:underline flex items-center gap-1">
            Open <Music className="size-3" />
          </span>
        </Link>

        {/* Message Stream */}
        {activeChannel.adminOnly ? (
          <div className="flex flex-1 items-center justify-center text-zinc-400 text-sm">
            <div className="text-center p-6 max-w-sm">
              <Settings2 className="mx-auto mb-3 size-10 text-violet-400 opacity-50" />
              <p className="font-bold text-white text-base">Admin Channel View</p>
              <p className="text-xs text-zinc-400 mt-1">Use the information panel on the right to manage member access for this channel.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3 sm:p-5 scrollbar-none">
              {/* Date Indicator */}
              <div className="flex items-center justify-center my-2">
                <span className="rounded-full bg-white/[0.05] border border-white/[0.06] px-3 py-0.5 text-[10px] font-semibold text-zinc-400 shadow-sm">
                  Today
                </span>
              </div>

              {/* Messages Mapping with Messenger Corner Stacking */}
              {visibleMessages
                .filter((m) => !m.parentMessageId)
                .map((message, index, array) => {
                  const prevMsg = array[index - 1];
                  const nextMsg = array[index + 1];
                  const isFirstInGroup = !prevMsg || prevMsg.author !== message.author;
                  const isLastInGroup = !nextMsg || nextMsg.author !== message.author;
                  const replies = visibleMessages.filter((m) => m.parentMessageId === message.id);
                  const isHovered = hoveredMessageId === message.id;

                  // Messenger Dynamic Bubble Corner Geometry
                  const bubbleRadius = message.mine
                    ? cn(
                        "rounded-2xl",
                        isFirstInGroup && !isLastInGroup && "rounded-tr-md",
                        !isFirstInGroup && !isLastInGroup && "rounded-r-md",
                        !isFirstInGroup && isLastInGroup && "rounded-br-md"
                      )
                    : cn(
                        "rounded-2xl",
                        isFirstInGroup && !isLastInGroup && "rounded-tl-md",
                        !isFirstInGroup && !isLastInGroup && "rounded-l-md",
                        !isFirstInGroup && isLastInGroup && "rounded-bl-md"
                      );

                  return (
                    <div
                      key={message.id}
                      className="relative group/msg"
                      onMouseEnter={() => setHoveredMessageId(message.id)}
                      onMouseLeave={() => {
                        setHoveredMessageId(null);
                        if (reactionPickerMessageId === message.id) {
                          setReactionPickerMessageId(null);
                        }
                      }}
                    >
                      <div className={cn("flex items-end gap-2 relative", message.mine && "justify-end")}>
                        {/* Recipient Avatar (Shown on last message of group) */}
                        {!message.mine && (
                          <div className="size-7 sm:size-8 shrink-0 mb-0.5">
                            {isLastInGroup ? (
                              <Avatar name={message.author} src={message.avatarUrl} className="size-full rounded-full" />
                            ) : (
                              <div className="size-full" />
                            )}
                          </div>
                        )}

                        {/* Floating Messenger Quick Hover Toolbar */}
                        <div
                          className={cn(
                            "absolute -top-7 z-20 items-center gap-1 rounded-full border border-white/10 bg-[#1c1b22] px-1.5 py-0.5 shadow-lg backdrop-blur-md transition-all duration-150",
                            message.mine ? "right-6" : "left-9",
                            isHovered ? "flex" : "hidden"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setReactionPickerMessageId(reactionPickerMessageId === message.id ? null : message.id)}
                            className="rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white transition"
                            title="React"
                          >
                            <Smile className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(message);
                              inputRef.current?.focus();
                            }}
                            className="rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white transition"
                            title="Reply"
                          >
                            <Reply className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMessageOptionsOpenId(messageOptionsOpenId === message.id ? null : message.id)}
                            className="rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white transition"
                            title="More"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </button>

                          {/* Floating 6-Emoji Reaction Pill */}
                          {reactionPickerMessageId === message.id && (
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-[#222129] px-2 py-0.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-90 duration-150 z-30">
                              {QUICK_REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReactToMessage(message.id, emoji)}
                                  className="transform transition hover:scale-130 active:scale-95 text-sm sm:text-base px-0.5"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Options Menu Popover */}
                        {messageOptionsOpenId === message.id && (
                          <div
                            className={cn(
                              "absolute -top-20 z-30 w-32 rounded-xl border border-white/10 bg-[#1c1b22] p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150",
                              message.mine ? "right-2" : "left-8"
                            )}
                          >
                            <button
                              type="button"
                              className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08]"
                              onClick={() => {
                                setReplyingTo(message);
                                setMessageOptionsOpenId(null);
                                inputRef.current?.focus();
                              }}
                            >
                              Reply
                            </button>
                            <button
                              type="button"
                              className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08]"
                              onClick={() => {
                                setStatus("Forwarding...");
                                setMessageOptionsOpenId(null);
                              }}
                            >
                              Forward
                            </button>
                            {(role === "owner" || role === "admin") && (
                              <button
                                type="button"
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-300 hover:bg-white/[0.08]"
                                onClick={() => {
                                  setStatus("Message pinned.");
                                  setMessageOptionsOpenId(null);
                                }}
                              >
                                Pin
                              </button>
                            )}
                          </div>
                        )}

                        {/* Bubble Container */}
                        <div className={cn("max-w-[82%] sm:max-w-[70%] flex flex-col", message.mine ? "items-end" : "items-start")}>
                          {/* Sender Name (Only on first of group for incoming) */}
                          {!message.mine && isFirstInGroup && (
                            <p className="mb-1 ml-1 text-[11px] font-bold text-violet-300 leading-tight">
                              {message.author}
                            </p>
                          )}

                          {/* Main Bubble Body */}
                          <div
                            className={cn(
                              "relative px-3.5 py-2 text-xs sm:text-sm leading-relaxed transition-all shadow-sm",
                              bubbleRadius,
                              message.mine
                                ? "bg-violet-600 text-white shadow-violet-600/10"
                                : "bg-[#1c1b22] border border-white/[0.08] text-zinc-100"
                            )}
                          >
                            <p className="break-words whitespace-pre-wrap">{message.body}</p>

                            {/* File / Image Attachment */}
                            {message.attachment && (
                              <a
                                href={attachmentHref(message.attachment)}
                                download
                                className="mt-2 block rounded-xl bg-black/30 p-2.5 transition hover:bg-black/50 border border-white/5"
                              >
                                {isImageMimeType(message.attachment.mimeType) && message.attachment.url && (
                                  <span
                                    role="img"
                                    aria-label={message.attachment.name}
                                    className="mb-2 block h-40 sm:h-48 w-full rounded-lg bg-cover bg-center"
                                    style={{ backgroundImage: `url("${message.attachment.url}")` }}
                                  />
                                )}
                                <span className="flex items-center justify-between gap-3">
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-bold text-white">{message.attachment.name}</span>
                                    <span className="text-[10px] text-zinc-400">
                                      {message.attachment.type ?? "File"} • {message.attachment.size}
                                    </span>
                                  </span>
                                  <Download className="size-4 shrink-0 text-zinc-300" />
                                </span>
                              </a>
                            )}
                          </div>

                          {/* Timestamp & Read Receipts */}
                          {isLastInGroup && (
                            <div className="flex items-center gap-1.5 px-1 pt-1 text-[10px] text-zinc-400">
                              <span>{message.createdAt}</span>
                              {message.mine && (
                                <span>
                                  {message.reads && message.reads.length > 0 ? (
                                    <CheckCheck className="size-3 text-violet-400" />
                                  ) : (
                                    <Check className="size-3 text-zinc-500" />
                                  )}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Messenger Read Receipts Avatar Stack */}
                          {message.mine && isLastInGroup && message.reads && message.reads.length > 0 && (
                            <div className="mt-0.5 flex items-center justify-end -space-x-1.5">
                              {message.reads
                                .filter((r) => r.profileId !== currentProfileId)
                                .slice(0, 4)
                                .map((read) => (
                                  <div
                                    key={read.profileId}
                                    className="size-4 rounded-full ring-1 ring-[#100f14] bg-zinc-800 shrink-0 overflow-hidden shadow-sm"
                                  >
                                    <Avatar name={read.fullName || "User"} src={read.avatarUrl} className="size-full text-[7px]" />
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Threaded Replies / Reactions under message */}
                      {replies.length > 0 && (
                        <div className="ml-9 sm:ml-10 mt-1.5 space-y-1.5 border-l-2 border-white/10 pl-3">
                          {replies.map((reply) => (
                            <div
                              key={reply.id}
                              className={cn("flex items-end gap-1.5 relative", reply.mine && "justify-end")}
                            >
                              {!reply.mine && (
                                <Avatar name={reply.author} src={reply.avatarUrl} className="size-5.5 rounded-full shrink-0 mb-0.5" />
                              )}
                              <div
                                className={cn(
                                  "w-fit max-w-[85%] rounded-2xl px-2.5 py-1 text-xs leading-relaxed",
                                  reply.mine
                                    ? "bg-violet-600 text-white rounded-br-sm"
                                    : "bg-[#1d1c24] border border-white/[0.08] text-zinc-200 rounded-bl-sm"
                                )}
                              >
                                {!reply.mine && <p className="text-[10px] font-bold text-violet-300">{reply.author}</p>}
                                <p className="break-words whitespace-pre-wrap">{reply.body}</p>
                                <p className={cn("text-right text-[8px] mt-0.5 leading-none", reply.mine ? "text-violet-200" : "text-zinc-400")}>
                                  {reply.createdAt}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              <div ref={bottomRef} />
            </div>

            {/* Status Toast */}
            {status && (
              <p role="status" aria-live="polite" className="px-4 pb-1 text-xs font-bold text-emerald-400">
                {status}
              </p>
            )}

            {/* ── Messenger Floating Pill Bottom Input Bar ── */}
            <div className="border-t border-white/10 bg-[#16151a]/95 p-2 sm:p-3 backdrop-blur-lg">
              {/* Replying Banner */}
              {replyingTo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs animate-in fade-in duration-150">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[10px] font-bold text-violet-300">Replying to {replyingTo.author}</span>
                    <span className="truncate text-[11px] text-zinc-300">{replyingTo.body}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Selected Attachment Preview */}
              {selectedAttachment && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs animate-in fade-in duration-150">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {isImageMimeType(selectedAttachment.details.mimeType) && selectedAttachment.previewUrl ? (
                      <span
                        aria-hidden="true"
                        className="size-8 shrink-0 rounded-lg bg-cover bg-center"
                        style={{ backgroundImage: `url("${selectedAttachment.previewUrl}")` }}
                      />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-200">
                        <FileText className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-white">{selectedAttachment.details.name}</span>
                      <span className="text-[10px] text-zinc-400">
                        {selectedAttachment.details.type} • {selectedAttachment.details.size}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                    onClick={clearSelectedAttachment}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Messenger Action Pill Cluster */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Plus / Attachments Menu */}
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Open attachment menu"
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-white transition active:scale-95",
                      attachmentOpen && "bg-white/[0.08] text-white"
                    )}
                    onClick={() => setAttachmentOpen((value) => !value)}
                  >
                    <Plus className="size-5" />
                  </button>
                  {attachmentOpen && (
                    <div
                      role="menu"
                      aria-label="Attachment options"
                      className="absolute bottom-12 left-0 z-30 w-48 rounded-2xl border border-white/10 bg-[#1f1e26] p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/[0.08] transition"
                        onClick={() => {
                          imageInputRef.current?.click();
                          setAttachmentOpen(false);
                        }}
                      >
                        <ImageIcon className="size-4 text-violet-300" />
                        Photos & Videos
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/[0.08] transition"
                        onClick={() => {
                          fileInputRef.current?.click();
                          setAttachmentOpen(false);
                        }}
                      >
                        <FileText className="size-4 text-violet-300" />
                        Files & Documents
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.mp3,.wav,.jpg,.jpeg,.png"
                    onChange={(event) => handleAttachmentSelected(event.target.files?.[0], "file")}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png"
                    onChange={(event) => handleAttachmentSelected(event.target.files?.[0], "image")}
                  />
                </div>

                {/* Quick Picture Button */}
                <button
                  type="button"
                  aria-label="Attach image"
                  className="hidden sm:flex size-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-white transition active:scale-95"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className="size-4.5" />
                </button>

                {/* Schedule Message (Admin/Owner) */}
                {(role === "owner" || role === "admin") && (
                  <div className="relative hidden md:flex items-center">
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="h-8 w-28 rounded-full bg-white/[0.06] border border-white/10 px-2 text-[10px] font-semibold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      title="Schedule Message"
                    />
                  </div>
                )}

                {/* Messenger Text Input Pill */}
                <div className="relative flex flex-1 items-center rounded-full bg-white/[0.06] border border-white/10 px-3.5 py-1 focus-within:border-violet-500/50 focus-within:bg-white/[0.09] transition">
                  <Input
                    ref={inputRef}
                    name="body"
                    className="h-7 w-full border-0 bg-transparent p-0 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessageContent();
                      }
                    }}
                    placeholder={`Message ${activeChannel.name}...`}
                  />

                  {/* Emoji Trigger */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Open emoji menu"
                      className="rounded-full p-1 text-zinc-400 hover:text-white transition"
                      onClick={() => setEmojiOpen((value) => !value)}
                    >
                      <Smile className="size-4" />
                    </button>
                    {emojiOpen && (
                      <div className="absolute bottom-10 right-0 z-30 flex flex-wrap gap-1 w-48 rounded-2xl border border-white/10 bg-[#1f1e26] p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                        {EMOJI_PALETTE.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`Insert ${emoji}`}
                            className="rounded-lg p-1.5 text-base hover:bg-white/[0.08] hover:scale-125 transition"
                            onClick={() => {
                              setDraft((value) => `${value}${emoji}`);
                              setEmojiOpen(false);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dynamic Messenger Send / Thumbs-Up Action */}
                {draft.trim() || selectedAttachment ? (
                  <Button
                    type="button"
                    aria-label="Send message"
                    disabled={isPending}
                    onClick={() => sendMessageContent()}
                    className="size-9 rounded-full bg-violet-600 text-white hover:bg-violet-500 p-0 flex items-center justify-center shrink-0 shadow-md active:scale-95 transition"
                  >
                    <Send className="size-4 ml-0.5" />
                  </Button>
                ) : (
                  <button
                    type="button"
                    aria-label="Send Like"
                    disabled={isPending}
                    onClick={sendQuickLike}
                    className="size-9 rounded-full text-violet-400 hover:bg-violet-500/15 flex items-center justify-center shrink-0 active:scale-90 transition"
                    title="Send Like"
                  >
                    <ThumbsUp className="size-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Right Channel Details & Files Drawer (Messenger Style) ── */}
      <aside
        className={cn(
          "w-76 flex-col bg-[#16151a]/95 backdrop-blur-md p-5 border-l border-white/10 overflow-y-auto shrink-0 text-left z-30 absolute right-0 h-full md:relative md:bg-[#16151a]/85 transition-all duration-300 scrollbar-none",
          infoPanelOpen ? "flex" : "hidden"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Details</span>
          <button
            type="button"
            onClick={() => setInfoPanelOpen(false)}
            className="rounded-full p-1 text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="flex flex-col items-center text-center mt-3">
          <Avatar name={activeChannel.name} src={activeChannel.avatarUrl} className="size-16 rounded-full text-xl shadow-lg ring-2 ring-violet-500/30" />
          <h3 className="mt-3 text-base font-extrabold text-white">{activeChannel.name}</h3>
          <p className="text-xs text-zinc-400 mt-0.5 capitalize">{activeChannel.type || "Worship"} Team</p>
        </div>

        {/* Members */}
        <div className="mt-6 border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">Team Members</p>
            <span className="text-xs font-semibold text-zinc-400">{teamMembers.length}</span>
          </div>
          <div className="flex items-center -space-x-2 overflow-hidden py-1">
            {teamMembers.slice(0, 6).map((m) => (
              <Avatar key={m.memberId} name={m.fullName} src={m.avatarUrl} className="size-8 rounded-full ring-2 ring-[#16151a] shrink-0" />
            ))}
            {teamMembers.length > 6 && (
              <span className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-2 ring-[#16151a] shrink-0">
                +{teamMembers.length - 6}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">About</p>
          <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
            Communication and worship coordination channel for the team.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 border-t border-white/[0.06] pt-4 space-y-2">
          {(role === "owner" || role === "admin") && (
            <button
              type="button"
              onClick={() => {
                if (managePanelOpen && managingChannelId === activeChannel.id) {
                  setManagePanelOpen(false);
                  setManagingChannelId(null);
                } else {
                  setManagingChannelId(activeChannel.id);
                  setManagePanelOpen(true);
                }
              }}
              className="w-full rounded-xl bg-white/[0.05] p-2.5 text-center text-xs font-bold text-white hover:bg-white/[0.09] transition"
            >
              Manage Members
            </button>
          )}
          <button
            type="button"
            onClick={leaveChannel}
            className="w-full rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-center text-xs font-bold text-red-400 hover:bg-red-500/20 transition"
          >
            Leave Channel
          </button>
        </div>

        {/* Shared Files & Media */}
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">Shared Files</p>
          <div className="mt-2.5 space-y-1.5">
            {activeChannelFiles.length > 0 ? (
              activeChannelFiles.map((file) => (
                <a
                  key={file.id ?? file.name}
                  href={attachmentHref(file)}
                  download
                  className="group flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5 transition hover:bg-white/[0.06]"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-bold text-white truncate">{file.name}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{file.type ?? "File"} • {file.size}</p>
                  </div>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-300 transition group-hover:text-white">
                    <Download className="size-3.5" />
                  </span>
                </a>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center">
                <Paperclip className="mx-auto size-4 text-zinc-500 mb-1" />
                <p className="text-xs font-semibold text-zinc-400">No files uploaded yet.</p>
              </div>
            )}
          </div>
          {activeChannelFiles.length > 0 && (
            <Link href="/setlists" className="mt-3 block text-center text-xs font-bold text-violet-300 hover:text-violet-200 transition-colors">
              View all team setlists &rarr;
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
