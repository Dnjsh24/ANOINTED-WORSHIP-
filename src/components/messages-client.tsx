"use client";

import { Download, Menu, MoreVertical, Search, Send, Settings2, Smile, SquarePen, UserMinus, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addChannelMemberAction, createChannelAction, getOrCreateDirectChannelAction, leaveChannelAction, removeChannelMemberAction, sendMessageAction, updateChannelPreferenceAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Channel = {
  id: string;
  name: string;
  type?: string;
  membersOnline: number;
  preview: string;
  messages: Message[];
  adminOnly?: boolean;
  avatarUrl?: string | null;
};

type TeamMember = {
  memberId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
};

type ChannelMembership = {
  channelId: string;
  memberId: string;
};

const emojiOptions = ["🙏", "🙌", "🎶", "✅"];

export function MessagesClient({
  channels,
  teamMembers = [],
  currentMemberId,
  role,
  allChannelMemberships = [],
}: {
  channels: Channel[];
  teamMembers?: TeamMember[];
  currentMemberId: string;
  role: string;
  allChannelMemberships?: ChannelMembership[];
}) {
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id || "");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [channelList, setChannelList] = useState(channels);
  const [memberships, setMemberships] = useState<ChannelMembership[]>(allChannelMemberships);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [managingChannelId, setManagingChannelId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [onlineMemberIds, setOnlineMemberIds] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const presenceChannel = supabase.channel(`online-presence-${activeChannelId}`, {
      config: { presence: { key: currentMemberId } }
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
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await presenceChannel.track({
              online_at: new Date().toISOString(),
              member_id: currentMemberId,
            });
          }
        });
    } catch (err) {
      console.warn("Messages presence channel already subscribed, recovering...", err);
      presenceChannel.unsubscribe();
      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState();
          const onlineIds = Object.keys(state);
          setOnlineMemberIds(onlineIds);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
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
  // Keep a ref to teamMembers so the realtime callback always sees the latest value
  // without needing to re-subscribe every time state changes
  const teamMembersRef = useRef(teamMembers);
  useEffect(() => { teamMembersRef.current = teamMembers; }, [teamMembers]);

  const currentMemberIdRef = useRef(currentMemberId);
  useEffect(() => { currentMemberIdRef.current = currentMemberId; }, [currentMemberId]);

  // Subscribe to real-time message inserts — runs once only (no channelList dep)
  useEffect(() => {
    const supabase = createClient();

    const realtimeChannel = supabase
      .channel("messages-realtime", { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMessage = payload.new as {
            id: string;
            channel_id: string;
            sender_member_id: string;
            body: string;
            created_at: string;
          };

          // Skip if I sent it (already added locally)
          if (newMessage.sender_member_id === currentMemberIdRef.current) {
            return;
          }

          const sender = teamMembersRef.current.find(
            (m) => m.memberId === newMessage.sender_member_id
          );
          const authorName = sender ? sender.fullName : "Unknown Member";

          const formattedMessage: Message = {
            id: newMessage.id,
            author: authorName,
            body: newMessage.body,
            avatarUrl: sender?.avatarUrl ?? null,
            createdAt: new Date(newMessage.created_at || Date.now()).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
            mine: false,
          };

          setChannelList((current) =>
            current.map((chan) =>
              chan.id === newMessage.channel_id
                ? {
                    ...chan,
                    preview: `${authorName}: ${newMessage.body}`,
                    messages: chan.messages.some((m) => m.id === formattedMessage.id)
                      ? chan.messages
                      : [...chan.messages, formattedMessage],
                  }
                : chan
            )
          );

          // Scroll to bottom after state update
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] Connected to messages channel");
        }
      });

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dep array — subscribe once, use refs for fresh data

  // Sync channel list when server re-fetches (e.g. navigation)
  useEffect(() => {
    setChannelList(channels);
    if (channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels]);

  // Auto-scroll to bottom when active channel or its messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChannelId]);

  const activeChannel = channelList.find((channel) => channel.id === activeChannelId) ?? channelList[0] ?? { id: "", name: "No Channel", membersOnline: 0, preview: "", messages: [] };
  const normalizedSearch = search.trim().toLowerCase();
  const visibleChannels = channelList.filter((channel) => `${channel.name} ${channel.preview}`.toLowerCase().includes(normalizedSearch));
  const visibleMessages = activeChannel.messages?.filter((message) =>
    `${message.author} ${message.body} ${message.attachment?.name ?? ""}`.toLowerCase().includes(normalizedSearch),
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
              messages: [...channel.messages, nextMessage],
            }
          : channel,
      ),
    );
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
          const nextChannel: Channel = {
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

  function sendCurrentMessage() {
    const body = draft.trim();
    if (!body) {
      return;
    }

    const formData = new FormData();
    formData.set("channelId", activeChannel.id);
    formData.set("body", body);

    startTransition(async () => {
      const result = await sendMessageAction(formData);
      setStatus(result.message);
      if (!result.ok) {
        return;
      }

      updateChannelMessages({
        id: `local-${Date.now()}`,
        author: "You",
        body,
        createdAt: "Now",
        mine: true,
      });
      setDraft("");
      setSearch("");
    });
  }

  function createChannel(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
    if (!name) {
      return;
    }

    startTransition(async () => {
      const result = await createChannelAction(initialActionState, formData);
      setStatus(result.message);
      if (!result.ok) {
        return;
      }

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

  async function toggleMute(muted: boolean) {
    const formData = new FormData();
    formData.set("channelId", activeChannel.id);
    formData.set("muted", String(muted));
    const result = await updateChannelPreferenceAction(formData);
    setStatus(result.message);
    setOptionsOpen(false);
  }

  async function leaveChannel() {
    const formData = new FormData();
    formData.set("channelId", activeChannel.id);
    const result = await leaveChannelAction(formData);
    setStatus(result.message);
    setOptionsOpen(false);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] overflow-hidden rounded-lg border border-white/10 bg-[#111014]">
      <aside
        className={cn(
          "transition-all duration-300 bg-[#201f24] p-4 flex flex-col border-r border-white/10 shrink-0 h-full overflow-y-auto",
          sidebarExpanded ? "w-64" : "w-16 lg:w-64"
        )}
      >
        <div className="flex items-center justify-between">
          <h1 className={cn("text-xl font-bold transition-all", sidebarExpanded ? "block" : "hidden lg:block")}>
            Messages
          </h1>
          {role !== "member" && (
            <button
              type="button"
              aria-label="Compose new message"
              className={cn(
                "rounded-md p-2 text-violet-200 hover:bg-white/[0.06]",
                !sidebarExpanded && "mx-auto lg:mx-0"
              )}
              onClick={() => setComposeOpen((value) => !value)}
            >
              <SquarePen className="size-5" />
            </button>
          )}
        </div>

        {composeOpen && (
          <form action={createChannel} className="mt-4 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left">
            <Input name="name" placeholder="New channel name" required className="h-8 text-xs font-semibold" />
            <Input name="avatarUrl" placeholder="Image URL (Optional)" className="h-8 text-xs font-semibold" />
            <Button type="submit" disabled={isPending} className="w-full h-8 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500">
              Create Channel
            </Button>
          </form>
        )}

        {/* Search — shows when expanded on mobile, always on desktop */}
        <div className={cn("relative mt-4", sidebarExpanded ? "block" : "hidden lg:block")}>
          <Search className="absolute left-3 top-2.5 size-4 text-zinc-400" />
          <Input className="pl-10" placeholder="Search messages..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {/* CHANNELS SECTION */}
        {sidebarExpanded ? (
          <p className="mt-6 font-mono text-[10px] font-bold uppercase text-zinc-400">Channels</p>
        ) : (
          <p className="mt-4 hidden lg:block font-mono text-[10px] font-bold uppercase text-zinc-400">Channels</p>
        )}
        {/* Thin divider in collapsed mobile view */}
        {!sidebarExpanded && (
          <div className="mt-3 mb-1 mx-auto w-8 h-px bg-white/10 lg:hidden" />
        )}

        <div className="mt-2 space-y-1">
          {visibleChannels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={cn(
                "flex items-center gap-3 rounded-md p-2 text-left w-full transition hover:bg-white/[0.04]",
                channel.id === activeChannel.id && "bg-violet-500/20",
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
              <Avatar name={channel.name} src={channel.avatarUrl} className="shrink-0" />
              <span className={cn(sidebarExpanded ? "block" : "hidden lg:block")}>
                <span className="block text-sm font-bold truncate max-w-36">{channel.name}</span>
                <span className="block max-w-44 truncate text-xs text-zinc-400">{channel.preview}</span>
              </span>
            </button>
          ))}
        </div>

        {/* DIRECT MESSAGES SECTION (Only shown when searching) */}
        {visibleMembers.length > 0 && (
          <>
            {sidebarExpanded ? (
              <p className="mt-6 font-mono text-[10px] font-bold uppercase text-zinc-400">Direct Messages</p>
            ) : (
              <p className="mt-4 hidden lg:block font-mono text-[10px] font-bold uppercase text-zinc-400">Direct Messages</p>
            )}
            {/* Thin divider in collapsed mobile view */}
            {!sidebarExpanded && (
              <div className="mt-3 mb-1 mx-auto w-8 h-px bg-white/10 lg:hidden" />
            )}

            <div className="mt-2 space-y-1">
              {visibleMembers.map((member) => (
                <button
                  key={member.memberId}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-md p-2 text-left hover:bg-white/[0.04] transition w-full",
                    sidebarExpanded ? "justify-start px-3" : "justify-center lg:justify-start lg:px-3"
                  )}
                  onClick={() => {
                    handleStartDirectMessage(member.memberId);
                    if (window.innerWidth < 1024) {
                      setSidebarExpanded(false);
                    }
                    setSearch(""); // Reset search after clicking to start DM
                  }}
                  title={member.fullName}
                >
                  <Avatar name={member.fullName} src={member.avatarUrl} className="shrink-0" />
                  <span className={cn(sidebarExpanded ? "block" : "hidden lg:block")}>
                    <span className="block text-sm font-bold truncate max-w-36">{member.fullName}</span>
                    <span className="block text-[10px] text-zinc-400 font-semibold capitalize">{member.role}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section aria-label={`${activeChannel.name} conversation`} className="flex flex-1 flex-col h-full overflow-hidden bg-[#111014]">
        <header className="flex h-16 items-center justify-between border-b border-white/10 bg-[#1d1b20] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden rounded-md p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition"
              onClick={() => setSidebarExpanded((prev) => !prev)}
              aria-label="Toggle message sidebar"
            >
              <Menu className="size-5" />
            </button>
            <Avatar name={activeChannel.name} src={activeChannel.avatarUrl} className="size-9 shrink-0" />
            <div>
              <h2 className="font-bold text-sm sm:text-base">{activeChannel.name}</h2>
              <p className="text-[10px] sm:text-xs font-semibold text-emerald-300">
                {onlineMemberIds.length > 0 ? onlineMemberIds.length : (activeChannel.membersOnline || 3)} Members online
              </p>
            </div>
          </div>
          <div className="relative flex gap-2 text-zinc-300">
            <button type="button" aria-label="Focus message search" className="rounded-md p-2 hover:bg-white/[0.06]" onClick={() => inputRef.current?.focus()}>
              <Search className="size-5" />
            </button>
            {(role === "owner" || role === "admin") && (
              <button
                type="button"
                aria-label="Manage channel members"
                className={cn("rounded-md p-2 hover:bg-white/[0.06] transition", managePanelOpen && managingChannelId === activeChannel.id ? "text-violet-400" : "")}
                onClick={() => {
                  if (managePanelOpen && managingChannelId === activeChannel.id) {
                    setManagePanelOpen(false);
                    setManagingChannelId(null);
                  } else {
                    setManagingChannelId(activeChannel.id);
                    setManagePanelOpen(true);
                  }
                }}
              >
                <Settings2 className="size-5" />
              </button>
            )}
            <button type="button" aria-label="Open channel options" className="rounded-md p-2 hover:bg-white/[0.06]" onClick={() => setOptionsOpen((value) => !value)}>
              <MoreVertical className="size-5" />
            </button>
            {optionsOpen && (
              <div role="menu" aria-label="Channel options" className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-white/10 bg-[#18171c] p-2 shadow-2xl shadow-black/40">
                <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-white/[0.06]" onClick={() => setStatus(`${activeChannel.name}: ${activeChannel.membersOnline} members`)}>
                  View members
                </button>
                <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-white/[0.06]" onClick={() => toggleMute(true)}>
                  Mute channel
                </button>
                <button type="button" role="menuitem" className="block w-full rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-white/[0.06]" onClick={leaveChannel}>
                  Leave channel
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Admin: Manage Members Panel */}
        {managePanelOpen && managingChannelId && (
          <div className="border-b border-white/10 bg-[#1a1920] px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-violet-300">Manage Members — {channelList.find(c => c.id === managingChannelId)?.name}</p>
              <button type="button" onClick={() => { setManagePanelOpen(false); setManagingChannelId(null); }} className="rounded-md p-1 text-zinc-400 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 max-h-48 overflow-y-auto">
              {teamMembers.map((member) => {
                const isMember = memberships.some(
                  (m) => m.channelId === managingChannelId && m.memberId === member.memberId
                );
                return (
                  <div key={member.memberId} className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={member.fullName} src={member.avatarUrl} />
                      <div>
                        <p className="text-sm font-semibold">{member.fullName}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">{member.role}</p>
                      </div>
                    </div>
                    {isMember ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleRemoveMember(managingChannelId, member.memberId)}
                        className="flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        <UserMinus className="size-3" /> Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAddMember(managingChannelId, member.memberId)}
                        className="flex items-center gap-1 rounded-md border border-violet-500/40 px-2 py-1 text-xs font-bold text-violet-400 hover:bg-violet-500/10 transition disabled:opacity-50"
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

        <Link href="/setlists/sunday-service" className="border-b border-white/10 bg-white/[0.04] px-6 py-4 transition hover:bg-white/[0.07]">
          <Badge>Pinned by Admin</Badge>
          <p className="mt-2 text-sm font-semibold text-zinc-300">Current Setlist: Sunday Worship - Dec 10</p>
        </Link>

        {activeChannel.adminOnly ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
            <div className="text-center">
              <Settings2 className="mx-auto mb-3 size-8 opacity-30" />
              <p className="font-semibold">Admin View</p>
              <p className="text-xs mt-1">Use the gear icon above to manage members of this channel.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="flex items-center gap-4 text-center font-mono text-[10px] font-bold text-zinc-500">
                <span className="h-px flex-1 bg-white/10" />
                Today
                <span className="h-px flex-1 bg-white/10" />
              </div>
              {visibleMessages.map((message) => (
                <div key={message.id} className={cn("msg-in flex gap-3", message.mine && "justify-end")}>
                  {!message.mine && <Avatar name={message.author} src={message.avatarUrl} />}
                  <div className={cn("max-w-xl rounded-lg px-4 py-3", message.mine ? "bg-violet-500 text-white" : "bg-white/[0.12]")}>
                    {!message.mine && <p className="mb-2 text-xs font-bold text-violet-200">{message.author}</p>}
                    <p className="text-sm font-semibold leading-6">{message.body}</p>
                    {message.attachment && (
                      <a
                        href={`/practice-files/${message.attachment.name}`}
                        download
                        className="mt-3 flex items-center justify-between rounded-md bg-black/40 p-3 transition hover:bg-black/60"
                      >
                        <span>
                          <span className="block text-sm font-bold">{message.attachment.name}</span>
                          <span className="text-xs text-zinc-400">{message.attachment.size}</span>
                        </span>
                        <Download className="size-4" />
                      </a>
                    )}
                    <p className="mt-2 text-right font-mono text-[10px] text-zinc-400">{message.createdAt}</p>
                  </div>
                </div>
              ))}
              {/* Scroll anchor — realtime messages scroll here */}
              <div ref={bottomRef} />
            </div>
            {status && <p className="px-4 pb-2 text-sm font-bold text-emerald-300">{status}</p>}
            <div className="flex items-center gap-3 border-t border-white/10 bg-[#111014] p-4">
              <div className="relative">
                <button type="button" aria-label="Open emoji menu" className="rounded-md p-2 text-zinc-400 hover:bg-white/[0.06]" onClick={() => setEmojiOpen((value) => !value)}>
                  <Smile className="size-5" />
                </button>
                {emojiOpen && (
                  <div className="absolute bottom-11 left-0 flex gap-1 rounded-md border border-white/10 bg-[#18171c] p-2">
                    {emojiOptions.map((emoji) => (
                      <button key={emoji} type="button" aria-label={`Insert ${emoji}`} className="rounded-md p-2 hover:bg-white/[0.06]" onClick={() => setDraft((value) => `${value}${emoji}`)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                ref={inputRef}
                name="body"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendCurrentMessage();
                  }
                }}
                placeholder={`Message ${activeChannel.name}...`}
              />
              <Button type="button" aria-label="Send message" disabled={isPending} onClick={sendCurrentMessage}>
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}
      </section>

      {/* ── Details Sidebar on the right ── */}
      <aside className="hidden xl:flex w-72 flex-col bg-[#16151a]/85 p-5 border-l border-white/10 overflow-y-auto shrink-0 animate-fade-in text-left">
        <div className="flex flex-col items-center text-center mt-4">
          <Avatar name={activeChannel.name} src={activeChannel.avatarUrl} className="size-16 rounded-2xl text-xl shrink-0" />
          <h3 className="mt-4 text-base font-extrabold text-white">{activeChannel.name}</h3>
          <p className="mt-1 text-xs font-semibold text-zinc-500 capitalize">{(activeChannel.type || "Group")} Channel</p>
        </div>

        <div className="mt-8 border-t border-white/[0.06] pt-5">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">8 Members</p>
          <div className="mt-3 flex items-center -space-x-2 overflow-hidden">
            {teamMembers.slice(0, 5).map((m) => (
              <Avatar key={m.memberId} name={m.fullName} src={m.avatarUrl} className="size-8 ring-2 ring-[#111014] shrink-0" />
            ))}
            {teamMembers.length > 5 && (
              <span className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-2 ring-[#111014] shrink-0">
                +{teamMembers.length - 5}
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">Description</p>
          <p className="mt-2 text-xs font-semibold text-zinc-400 leading-relaxed">
            Communication for the worship team.
          </p>
        </div>

        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">Files</p>
          <div className="mt-3 space-y-2">
            {[
              { name: "Setlist_Jul12.pdf", size: "240 KB", type: "PDF" },
              { name: "Chord-Charts.zip", size: "1.2 MB", type: "ZIP" },
              { name: "Stage-Plot.pdf", size: "1.1 MB", type: "PDF" },
            ].map((file) => (
              <div key={file.name} className="group flex items-center justify-between rounded-xl bg-white/[0.02] p-2.5 hover:bg-white/[0.04] transition">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-xs font-bold text-white truncate">{file.name}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{file.type} · {file.size}</p>
                </div>
                <button className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-400 hover:text-white transition">
                  <Download className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Link href="/setlists" className="mt-4 block text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
            View all files →
          </Link>
        </div>
      </aside>
    </div>
  );
}
