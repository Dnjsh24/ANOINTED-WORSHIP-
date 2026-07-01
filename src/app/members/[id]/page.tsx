import { Mail, Music, Shield } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { members, pendingRequests } from "@/lib/sample-data";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member =
    members.find((item) => item.id === id) ??
    members.find((item) => item.profile.fullName.toLowerCase().replaceAll(" ", "-").replaceAll(".", "") === id) ??
    members[0];
  const request = pendingRequests.find((item) => item.id === id);

  return (
    <AppShell active="Team Management">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-6 text-center">
          <Avatar name={request?.name ?? member.profile.fullName} src={member.profile.avatarUrl} className="mx-auto size-20 text-2xl" />
          <h1 className="mt-5 text-2xl font-bold">{request?.name ?? member.profile.fullName}</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-400">{request?.ministry ?? member.ministry}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Badge>{request ? "Pending" : member.status}</Badge>
            {!request && <Badge>{member.attendanceRate}% Attendance</Badge>}
          </div>
        </Card>
        <Panel>
          <h2 className="text-2xl font-bold">Member Details</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Mail className="size-4" />
                Email
              </p>
              <p className="mt-2 font-semibold">{request ? "Pending invitation" : member.profile.email}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Shield className="size-4" />
                Access Level
              </p>
              <p className="mt-2 font-semibold">{request ? "member" : member.role.replace("_", " ")}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 md:col-span-2">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Music className="size-4" />
                Ministry Role
              </p>
              <p className="mt-2 font-semibold">{request?.ministry ?? member.ministry}</p>
            </div>
          </div>
          <ButtonLink href="/members" variant="secondary" className="mt-6">
            Back to Team
          </ButtonLink>
        </Panel>
      </div>
    </AppShell>
  );
}
