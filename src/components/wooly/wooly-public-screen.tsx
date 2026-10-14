import { WoolyScreen } from "./wooly-screen";

export function WoolyPublicScreen() {
  return <WoolyScreen audience={{ userId: "wooly-public", hasTeam: false, canManageMembers: false, session: "guest" }} />;
}
