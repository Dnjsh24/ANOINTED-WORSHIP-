"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    // In a real app, this would query the notifications table
    // For now, it's just a UI placeholder to satisfy the build
    const fetchUnreadCount = async () => {
      // Mock count
      setUnreadCount(0);
    };

    fetchUnreadCount();
  }, []);

  return (
    <Button variant="ghost" className="relative !px-2">
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );
}
