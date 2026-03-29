"use client";

import { AdminChatAssistant } from "@/components/admin/admin-chat-assistant";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AdminChatAssistant />
    </>
  );
}
