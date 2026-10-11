import type { Permission } from "./rbac";
import type { WoolyStep } from "./wooly";
import type { TeamRole } from "../types";

export type WoolyGuideAccess = "public" | "before-team" | "team" | "managers" | readonly Permission[] | { readonly roles: readonly TeamRole[] } | { readonly all: readonly Permission[] };
export interface WoolyPageGuide {
  title: string;
  route: string;
  access: WoolyGuideAccess;
  steps: readonly WoolyStep[];
}
type Instruction = readonly [target: string, title: string, body: string, permission?: Permission];

function guide(title: string, route: string, access: WoolyGuideAccess, instructions: readonly Instruction[]): WoolyPageGuide {
  return { title, route, access, steps: instructions.map(([target, heading, body, permission], index) => ({
    id: `step-${index + 1}`, route, target, title: heading, body, permission, pose: "pointing",
  })) };
}

// Routes with parameters are bound to the record already open, never to a made-up ID.
export const woolyPageGuides = {
  "page-welcome": guide("Welcome page", "/", "public", [
    ["welcome-intro", "Welcome to Sunday Setlist", "Welcome! Sunday Setlist keeps your team's songs, service plans, schedule, and conversations together. Start by signing in, then choose the team you serve with."],
    ["welcome-start", "Start with your account", "Choose Get Started with Google. Sign in using the account you want to use for your team. After sign-in, you'll open your team or see options to create or join one."],
  ]),
  "page-login": guide("Sign in", "/login", "public", [
    ["login-form", "Use your Google account", "Choose Sign in with Google, then select your Google account and complete the sign-in screen. Use the same account each time so you return to the right team and profile."],
    ["login-form", "After signing in", "After sign-in, approved members open their team. New users choose Create a Team or Join a Team; pending members wait for approval. If an error appears, read it before retrying. A setup error needs help from website support."],
  ]),
  "page-teams": guide("Choose your team", "/teams", "before-team", [
    ["team-choice", "Create or join", "Choose Create a Team if you're setting up a new workspace for your group. Choose Join a Team if your leader already has a workspace and has shared its team code."],
    ["team-choice", "Have a team code?", "Choose Join a Team to enter your leader's code and request access. Joining requires a leader's approval. If you don't have the code, ask your leader before continuing."],
  ]),
  "page-join": guide("Join a team", "/teams/join", "before-team", [
    ["join-code", "Enter the code", "Type your leader's code into Team Code. Wait for the team preview, then check its name and location. If you see No team found, check the code with your leader before submitting."],
    ["join-role", "Choose how you serve", "Open Choose Your Role and select how you serve. This helps your leader understand your request. Your leader reviews the request and decides which team permissions you receive."],
    ["join-request", "Request access", "Check the team preview and your selected role, then choose Request to Join Team. A successful request opens the waiting page. Your dashboard opens after a leader approves access."],
  ]),
  "page-create": guide("Create a team", "/teams/new", "before-team", [
    ["create-details", "Team details", "Enter Ministry / Team Name and Location, then choose Default Service Time, Timezone, and Your Ministry Role. Timezone and service day are displayed but are not saved by this setup flow. Choose Continue on the team form to open invitations. Wooly's Next button only continues this guide."],
    ["create-invites", "Invitations", "On the invitations step, type an email address and choose Add to put it in the list. Remove an incorrect address with its trash icon. This list is only a local draft: Create Team does not save it or send invitations. Share your team code after setup. Choose the form's Continue button to review."],
    ["create-review", "Review and create", "On Review & Create Workspace, check the team name, location, service time, ministry role, and invitation count. Use the form's Back button to correct details. Choose Create Team to submit. Success opens Home; an error stays on setup with a message."],
  ]),
  "page-pending": guide("Waiting for approval", "/pending", "before-team", [
    ["pending-status", "Your request is being reviewed", "Your request has been sent, but you don't have team access yet. Check Request Details to confirm the team and role. Leave this page open while it checks for approval; it opens the dashboard when your leader approves you."],
    ["pending-status", "If you need help", "If you're still waiting, contact the team leader who gave you the code. If your request was rejected, ask what needs correcting before requesting again. Wooly can explain joining, but only your team leader can approve access."],
  ]),
  "page-home": guide("Home", "/dashboard", "team", [
    ["home", "Your team's overview", "Start with the next service card: check the date, call time, location, and leader. Confirm Availability opens the event; Open Setlist opens its songs; Message Team opens conversations. A new team may show No Service Scheduled until a plan is added."],
    ["nav-setlists", "Prepare for a service", "Choose Setlists to find your service's music. Open a setlist card, then read Song Order from top to bottom. Open a song title to see its lyrics and chords, or use the rehearsal tools on the setlist page."],
    ["nav-events", "Check your schedule", "Choose Timeline to check services and rehearsals. Open an event and review its date, location, and assignments. In Attendance, choose I'm available, Maybe, or I can't attend, then check the saved response."],
  ]),
  "page-setlists": guide("Setlists", "/setlists", "team", [
    ["setlist-search", "Find a plan", "Type part of a setlist name into Search setlists. Open the matching card to see its songs. If you can't find it, clear the search and check the selected tab and Filters."],
    ["setlist-views", "Choose a view", "Use All to browse every plan, Standalone for plans without a linked event, Upcoming for future linked events, and Past for previous ones. Filters can narrow linked plans by Leader or Service Type. Open a card to read Song Order."],
    ["setlists", "Build a plan", "Choose New Setlist to start a song plan. Enter a name, add songs, arrange their order, then choose Create Setlist on the form. To put an existing standalone plan on the schedule, link it from the event's edit page.", "setlists.manage"],
  ]),
  "page-setlist-new": guide("Create a setlist", "/setlists/new", ["setlists.manage"], [
    ["setlist-details", "Describe the service", "Enter a clear Setlist Name, such as Sunday Morning Worship, and add useful Notes. This form prepares a song plan. Schedule dates and team assignments belong to Timeline; a linked event supplies those service details."],
    ["setlist-song-search", "Choose and order songs", "Type a song title into Search songs in Song Library. Drag a song into the selected song area, then drag its handle to arrange the order. Use the remove icon for an unwanted selection. If the library is empty, add songs first or save the plan for later."],
    ["setlist-save", "Save when ready", "Review Setlist Name, Notes, and the selected song order, then choose Create Setlist. Wait for the result before leaving. If the form reports an error, correct the named field and try again; Cancel returns without submitting."],
  ]),
  "page-setlist-edit": guide("Edit a setlist", "/setlists/[id]/edit", ["setlists.manage"], [
    ["setlist-details", "Update this plan", "Update Setlist Name or Notes for this plan. For a linked service's date, location, or assignments, edit the Timeline event. Check that you're editing the correct plan before changing its music."],
    ["setlist-song-search", "Adjust the songs", "Search Song Library, drag a song into the selected area, and drag song handles to change the order. Remove an unwanted selection with its remove icon. Check the numbered order your team will follow."],
    ["setlist-save", "Review and save", "Choose Save Changes to submit the updated name, notes, and song order. Check the result before leaving. Cancel returns to the setlist without submitting this form."],
  ]),
  "page-setlist-templates": guide("Setlist templates", "/setlists/templates", ["setlists.manage"], [
    ["page-content", "Reusable service plans", "Saved Templates lists reusable starting plans. Each card shows a name, optional description, and number of slots. Use these details to identify the template you're managing."],
    ["template-list", "Review saved templates", "Check the name carefully before using a card's trash icon: it deletes that saved template. This page manages templates rather than a scheduled service. If you see No templates saved yet, there are no template cards to manage."],
  ]),
  "page-setlist-detail": guide("Setlist details", "/setlists/[id]", "team", [
    ["setlist-order", "Follow the song order", "Read Song Order from the first numbered song to the last. Each row shows the assigned key; open its song title for the chart. Editors can use the row's key, notes, and order controls. If no songs are listed, a setlist editor can use + Add Song."],
    ["setlist-team", "Check the team", "For an event-linked plan, Team shows who is serving. Check Conflict Detection and Who's Missing? before rehearsal, then ask your leader about gaps or overlaps. A standalone setlist has no event assignments until it is linked to an event."],
    ["setlist-practice-tools", "Prepare to play", "Practice Tools shows reference videos only for songs that have a video link. Use the setlist's practice or stage links to read charts for rehearsal or service. If this video section is missing, open the song chart instead."],
    ["setlist-history", "Review changes", "Read Version History to see what changed, who changed it, and when. An empty history means there are no saved changes to display yet. Use the latest song order and assigned keys when preparing your part."],
  ]),
  "page-setlist-add-song": guide("Add a setlist song", "/setlists/[id]/add-song", ["setlists.manage"], [
    ["song-picker", "Choose a library song", "Search library to add by song title, then check the result's artist and key. Choose its plus button to put the song in the Staging Box. Staging lets you review the selection before it is saved to this setlist."],
    ["song-picker-form", "Review the staged songs", "In Staging Box, set each song's assigned key and choose Worship or Praise. Remove an unwanted song with its X. Choose Save to Setlist to save the staged songs, or Cancel to return without saving them."],
  ]),
  "page-practice": guide("Practice mode", "/setlists/[id]/practice", "team", [
    ["practice-songs", "Choose a song", "Use Previous Song and Next Song to move through the setlist. Open Setlist Queue to jump to a particular song. Check the current song title before practicing; an empty setlist needs songs added first."],
    ["practice-controls", "Prepare your chart", "Use the key and capo controls to match your part, and adjust chart size for comfortable reading. Toggle Auto Scroll to start or stop scrolling; Scroll Speed changes its pace. Open Metronome Settings to set up a click when you need one."],
    ["practice-chart", "Work through the music", "Follow the lyrics and chords in the chart. Select a section to jump to it and loop it for rehearsal. Start media playback yourself when a reference is available. To change the saved lyrics or chords, use the song's edit page if you have access."],
  ]),
  "page-stage": guide("Stage mode", "/setlists/[id]/stage", "team", [
    ["stage-controls", "Set up your view", "Before the service, check the current song and use the chart-size, key, capo, and view controls to make your part readable. Set up scrolling while rehearsing so the pace suits you."],
    ["stage-chart", "Follow the chart", "Follow the chart while you play. Use the song navigation for the next song, and the scrolling control to start or stop movement. Check the song title after each change. Close Wooly when you're ready to use the stage view."],
  ]),
  "page-projector": guide("Projector output", "/setlists/[id]/projector", "team", [
    ["projector-output", "Audience display", "Projector output is the audience screen. Put this page on the display the congregation will see. Use the connected presenter or remote to choose the live content; this page displays the result."],
    ["projector-output", "Before going live", "During rehearsal, change a slide from the connected controller and check that this output follows. Check text size and the display connection, then close Wooly before showing the screen to the congregation."],
  ]),
  "page-confidence": guide("Confidence output", "/setlists/[id]/confidence", "team", [
    ["confidence-output", "A display for the team", "Confidence output is the display for performers to follow the presentation. Position it where the team can read it. The connected presenter or remote chooses the content shown here."],
    ["confidence-output", "Check before the service", "Before the service, move through a few slides from the controller and check that the team can read this display. If the content doesn't update, check the connected session. Close Wooly before using the screen live."],
  ]),
  "page-songs": guide("Song library", "/songs", "team", [
    ["song-search", "Find a song", "Type a title, artist, or tag into Search by title, artist, or tag. Open the matching song card to read its chart. If no result appears, clear the search and check whether Favorites is limiting the list."],
    ["song-filters", "Narrow the library", "Choose Filter to open the library options. Favorites shows starred songs; All Songs removes that restriction. A-Z sorts by title, while Most Played puts frequently used songs first."],
    ["song-list", "Open a chart", "Open a song card to see its lyrics, chords, key, and BPM. Check the artist so you prepare the correct version. If the library is empty, ask a song editor to add a song using their permitted controls."],
  ]),
  "page-song-new": guide("Add a song", "/songs/new", ["songs.create"], [
    ["song-details", "Describe the song", "Fill in Song Title and Artist / Source, then set Default Key and the musical details, including BPM when known. Add useful tags. If you import a chart from a URL, check the imported title, key, and text before saving."],
    ["song-chart-input", "Add the chart", "Enter the lyrics and chords in the chart field. Use section labels such as Verse and Chorus so the team can follow the structure. Check chord positions and line breaks before saving the chart."],
    ["song-save", "Save for your team", "Review the title, artist, default key, BPM, and chart, then choose Create Song. Check the result message. If your team's review workflow requires approval, a reviewer must approve the song before it becomes available to the team."],
  ]),
  "page-song-edit": guide("Edit a song", "/songs/[id]/edit", ["songs.edit"], [
    ["song-details", "Update song details", "Check the song title and artist before editing. Update the fields that need correcting, such as Default Key or BPM. These saved song details are shared with your team."],
    ["song-chart-input", "Review lyrics and chords", "Correct the lyrics or chords, then check Verse and Chorus labels and chord positions. Keep the chart readable for the team. Review the whole affected section before saving."],
    ["song-save", "Save your changes", "Choose Save Song to submit the edited details and chart. Check the result before leaving. Use Cancel to return to the song without submitting these edits."],
  ]),
  "page-song-detail": guide("Song chart", "/songs/[id]", "team", [
    ["song-heading", "Meet this song", "Check the song title and artist, then read its key, BPM, and time signature. BPM is the tempo in beats per minute. Confirm that this is the version your team plans to use."],
    ["song-controls", "Adjust your view", "Choose the key you need to transpose the displayed chords. Check the capo setting if you're playing guitar. When opened from a setlist, an available Save to Setlist button saves the assigned key for that setlist; changing the view alone is for practice."],
    ["song-chart", "Practice the chart", "Read the chart from section to section. Start or stop auto-scroll yourself and adjust Scroll Speed to suit your pace. Use available media or metronome tools for rehearsal; open the song's edit page to change its saved chart if permitted."],
  ]),
  "page-song-trash": guide("Song trash", "/songs/trash", ["songs.delete"], [
    ["page-content", "Removed songs", "Song trash contains songs removed from the active library. Check each song's title and deletion countdown before acting. If you need a song for a setlist again, restore it before returning to the library."],
    ["song-trash-actions", "Restore or permanently delete", "Choose Restore to return a song to the library. Delete Permanently removes it for good after its confirmation. Double-check the song title before confirming permanent deletion."],
  ]),
  "page-events": guide("Timeline", "/events", "team", [
    ["event-search", "Find a service or rehearsal", "Type part of an event name into Search events. Use All Events, Upcoming, or Past to browse the schedule. Choose Calendar View if you prefer to find a service or rehearsal by date."],
    ["event-calendar", "Open event details", "In Calendar View, use the month arrows to browse dates and choose an event. In the list, open its card. The event page shows the schedule, location, team assignments, attendance, and any linked setlist."],
    ["event-availability", "Check your responses", "My Availability (Upcoming) counts your Going, Maybe, Unavailable, and No Response replies. Open an event to update its Attendance response. Update Availability returns to the timeline; it does not itself save a reply."],
    ["event-requests", "Review requests", "In Event Requests, read the proposed event's name and date before using its review controls. Approve accepts the request; Reject declines it. An empty section means there are no requests to review.", "events.review"],
  ]),
  "page-event-new": guide("Create or request an event", "/events/new", ["events.manage", "events.request"], [
    ["event-details", "Plan the event", "Fill in Title, Event type, Date, Location, and the service or rehearsal times shown for your event type. Choose Service + Rehearsal when both belong together. Check the schedule before assigning the team."],
    ["event-assignments", "Prepare the team", "Under Team Assignments, choose the people serving in each role. Use Add More, Add Singer, or Add Dancers for extra assignments. Review any scheduling conflict warning, then add preparation notes for the team."],
    ["event-save", "Check and submit", "Review the schedule and assignments. Create Event creates the plan when your access allows it; Request Event sends it for approval. Check the result message. Attendance for a pending request opens after the event is approved."],
  ]),
  "page-event-edit": guide("Edit an event", "/events/[id]/edit", ["events.manage"], [
    ["event-details", "Update the schedule", "Check this event's title, then update its date, location, or times. For a service with rehearsal, check both schedules. Review the linked setlist selection when you're changing which song plan belongs to this event."],
    ["event-assignments", "Check assignments", "Review Team Assignments and replace or add people where needed. Read scheduling conflict warnings before proceeding. Update the preparation notes so the team has the correct instructions."],
    ["event-save", "Save when ready", "Choose Save Changes to submit the edited event. Check the result before leaving. This updates the schedule your team uses, so confirm the date, times, location, and assignments before saving."],
  ]),
  "page-event-detail": guide("Event details", "/events/[id]", "team", [
    ["event-summary", "Check the plan", "Check the event name, date, start time, call time, location, and rehearsal details that are shown. Read the notes before preparing. If the schedule is wrong, ask an event editor to correct it."],
    ["event-team", "See who's serving", "Read Assigned Roles / Teams to see who's serving. In Attendance, choose I'm available, Maybe, or I can't attend and check the saved response. A pending event must be approved first. Use Open Setlist Detail when a song plan is linked."],
  ]),
  "page-messages": guide("Messages", "/messages", "team", [
    ["message-search", "Find a conversation", "Type a conversation name into Search conversations, then choose the channel or direct conversation you need. On a phone, use Toggle message sidebar to see the conversation list."],
    ["message-conversation", "Read the discussion", "Check the conversation name at the top so you know who will receive your reply. Read recent messages before responding. Use a message's Reply control when you want to refer to that specific message."],
    ["message-compose", "Write your reply", "Type into the message field, then choose Send message. Check that your message appears in the conversation. Use attachment controls only when your access allows uploads; check the recipient and attachment before sending.", "messages.send"],
  ]),
  "page-profile": guide("Your profile", "/profile", "team", [
    ["profile-details", "Introduce yourself", "Update Full Name, Birthday, Team Anniversary, and Ministry Involvement. Select Band Member to reveal instrument choices. Email is read-only and Leadership Role is managed by an administrator."],
    ["profile-save", "Save your profile", "Choose Save Changes to save your name, birthday, anniversary, and ministries, then check the result message. Phone, Time Zone, Language, and notification changes are not saved to your account yet. If saving fails, keep your edits on this page and try again."],
  ]),
  "page-members": guide("Team management", "/members", "managers", [
    ["member-search", "Find a member", "Type a name into Search members and use Role filter to narrow Active Team. Select a member row to open their details drawer. Owner and admin accounts can change eligible members' roles there. Role changes affect which team tools that person can use."],
    ["member-team-code", "Share the team code", "Share Team Code with the people you want to join. They enter it on Join a Team and send an access request. Regenerate team code replaces the current code, so share the new one with anyone who has not joined yet."],
    ["member-requests", "Review access", "In Join Requests, check the person's name and requested role before approving or rejecting. Approving grants team access; rejecting leaves them outside the team. An empty section means there are no pending requests."],
  ]),
  "page-member-invite": guide("Invite a member", "/members/invite", "managers", [
    ["member-invite-form", "Prepare an invitation", "Enter the person's Email and choose their intended Role. Add an Optional message if you need to explain why you're inviting them. Check the address and access level before submitting."],
    ["member-invite-save", "Send when ready", "Choose Send Invite and read the result. Invitation saved means a pending invitation record was saved; this action does not deliver email. If an error appears, correct it before retrying. Choose Cancel to return to Team Management without submitting this invitation."],
  ]),
  "page-member-requests": guide("Joining requests", "/members/requests", "managers", [
    ["join-request-search", "Find a request", "Use Search requests to find a person. Check their name, email, ministry, and requested date against the person you expect to join. Clear the search to see all pending requests."],
    ["join-request-list", "Review before deciding", "Choose Approve to grant this person team access, or Reject to decline the request. Review their details first because these controls submit your decision. No pending join requests means there is nothing waiting for review."],
  ]),
  "page-member-detail": guide("Member details", "/members/[id]", "managers", [
    ["page-content", "Review this member", "Confirm the member's name before reviewing their account. Read Member Details for their contact and team information. Check their current role so you understand how they serve."],
    ["member-detail", "Understand their access", "Use this page to review the member's details and access. Return to Team Management for the available role and removal controls. Check the person's identity before changing their team access there."],
  ]),
  "page-analytics": guide("Analytics", "/analytics", { roles: ["owner", "admin"] }, [
    ["page-content", "Understand team activity", "Start with Top rotation, Confirmed availability and Channel activity. Use From and To, then Apply, to select exact dates. Empty teams may have no recorded data. Availability uses recorded replies, not physical attendance."],
    ["page-content", "Read the context", "Read Song Usage and choose Top 5 Songs, Top 10 Songs or All Songs. Attendance Trend compares recorded availability across periods; choose Weekly or Daily. Availability by Event Type groups recorded replies. Channel Activity counts delivered messages in accessible channels. Expand the data sections to read exact values."],
  ]),
  "page-announcements": guide("Announcements", "/announcements", "team", [
    ["notice-feed", "Read team updates", "Read each announcement's title and message, then check its category, priority, and intended audience. If an acknowledgement control is shown, use it after reading so your team knows you received the update."],
    ["notice-create", "Share an update", "Open the announcement composer. Fill in Title and Message, set Category and Priority, and use Tag to choose All team, Team role, or Person. Check any Linked event and recipients before choosing Post Announcement. Opening the composer pauses this guide.", "members.manage"],
  ]),
  "page-reminders": guide("Reminders", "/reminders", "team", [
    ["reminder-feed", "Check what needs attention", "Read the reminder's message, scheduled date, and intended audience. Open any provided action link to complete the task. Read or Acknowledged describes the notice status; check the task itself to see what still needs doing."],
    ["notice-create", "Prepare a reminder", "Open the reminder composer, enter Title and Message, and choose recipients with Tag. Set Schedule date and, if needed, Repeat and Occurrences. Check the audience and schedule before choosing Send Reminder. Opening the composer pauses this guide.", "members.manage"],
  ]),
  "page-dance": guide("Dance library", "/dance", "team", [
    ["dance-search", "Find a dance chart", "Search dance charts by title, song, or artist. Open a matching card, then confirm the song and version before learning its steps. Clear the search if you don't see the chart you need."],
    ["dance-list", "Prepare your part", "Use a chart's steps, video reference, formation, and outfit notes to prepare with the team. If there are no charts, ask a dance editor to add the first one. If a section is missing, the chart has no details saved for it yet."],
    ["dance-form", "Add a chart", "In Add Steps, enter a title, choose or describe the song and version, and write the steps by song section. Add a video URL, formation, and outfit notes when useful. Choose Save Dance Chart after reviewing the form.", "dance_notes.manage"],
  ]),
  "page-dance-detail": guide("Dance chart", "/dance/[id]", "team", [
    ["dance-steps", "Learn the steps", "Read Dance / Tambourine Steps from the beginning of the song. Follow the instructions for each section, such as Verse or Chorus. Confirm the song version with your leader before rehearsing."],
    ["dance-reference", "Check the reference", "Watch Video Reference when a link is provided, then read Formation for where each dancer should stand or move. If either section is missing, ask the chart's editor or your leader for the reference."],
    ["dance-outfit", "Prepare materials", "Read Outfit / Props before rehearsal or service and prepare the listed items. If no notes are shown, confirm with your leader what to bring."],
  ]),
  "page-dance-edit": guide("Edit dance steps", "/dance/[id]/edit", ["dance_notes.manage"], [
    ["dance-form", "Update the chart", "Confirm the chart's title, song, and version. Update the steps by section, then review Video Reference, Formation, and Outfit / Props so they agree with the choreography."],
    ["dance-save", "Save the steps", "Choose Save Changes to submit the edited chart, then check the result message. Use Cancel to leave without submitting. Your team will use the saved steps when they open this chart."],
  ]),
  "page-settings": guide("Team settings", "/admin/settings", "managers", [
    ["settings-tabs", "Choose a settings area", "Choose the tab for the task: Team Controls for workspace information and invites, Ministry Defaults for service defaults, Review Workflow for approvals, or Permissions for role access. Other tabs cover private materials, integrations, billing, and activity."],
    ["settings-content", "Review each setting", "Read the fields in the selected tab and change only what your team needs. Use that section's save control when one is provided and read the result. Review Workflow and Permissions affect other members, so check the selected role or rule before applying it."],
  ]),
  "page-sync": guide("Sync information", "/sync", "team", [
    ["page-content", "About offline sync", "Sync Center on the website explains where offline content is managed. To download worship content for offline use, open Sync Center in the Windows app. This website page has no download or sync controls."],
    ["page-content", "Continue on the website", "Use the website navigation to return to Songs, Setlists, or Timeline. The installed PWA uses these website pages too; Windows offline content is managed separately in the Windows app."],
  ]),
  "page-remote": guide("Connect Worship Remote", "/worship-remote", "public", [
    ["remote-pin", "Enter the pairing PIN", "On the Windows Presenter, choose Pair phone. Type its six-digit code here, then choose Connect to Presenter. Confirm you're pairing with the PC you intend to control before connecting."],
    ["remote-scan", "Or scan the QR code", "Choose Scan QR Code and allow camera access to scan the presenter's pairing code. You can also open the QR link with your phone's normal camera. If the scanner is unavailable, enter the six-digit code instead."],
    ["remote-pin", "If a link has expired", "Pairing codes expire after ten minutes and work once. If a code is expired or already used, choose Pair phone again on the presenter to get a new code or QR link, then retry here."],
  ]),
  "page-remote-session": guide("Worship Remote controls", "/worship-remote/session/[sessionId]", "public", [
    ["remote-controls", "Check your connected session", "Check that the remote is connected to the intended presenter session before using its controls. If the session has ended or the connection fails, return to Worship Remote and pair again with a fresh code."],
    ["remote-navigation", "Follow the service", "Select the song or section you want to present, then use the available navigation controls to move the content. Check the live output after each change. These controls affect the connected presentation, so practice before the service."],
    ["remote-controls", "Prepare before going live", "Review display controls, timers, and any stage notes you plan to use while rehearsing. Keep the audience and confidence screens in view when testing. Close Wooly when you're ready to operate the live remote."],
  ]),
} as const satisfies Record<string, WoolyPageGuide>;

export type WoolyPageTourId = keyof typeof woolyPageGuides;
export function matchesWoolyRoute(pattern: string, pathname: string): boolean {
  const expected = pattern.split("?")[0].split("/");
  const actual = pathname.split("?")[0].split("/");
  return expected.length === actual.length && expected.every((segment, index) =>
    segment.startsWith("[") ? Boolean(actual[index]) && !actual[index].includes("[") && !actual[index].includes("]") : segment === actual[index]);
}

export function getWoolyPageGuideId(pathname: string): WoolyPageTourId | null {
  pathname = pathname.split("?")[0];
  if (pathname.includes("[") || pathname.includes("]")) return null;
  const ids = Object.keys(woolyPageGuides) as WoolyPageTourId[];
  return ids.find((id) => woolyPageGuides[id].route === pathname) ?? ids.find((id) => matchesWoolyRoute(woolyPageGuides[id].route, pathname)) ?? null;
}

// These pages render redirects on the website; the destination owns the guide.
// This private operations page uses a dedicated support role, not team-tour access.
// Shared edit requests are explicitly outside this catalog until their guides are verified.
export const woolyOperationalRoutes = ["/support/wooly", "/requests", "/requests/new"] as const;
export const woolyRedirectRoutes = ["/presenter", "/setlists/[id]/presenter", "/setlists/[id]/remote"] as const;
