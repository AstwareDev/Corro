"use client";

import { useParams } from "next/navigation";
import { ChatScreen } from "@/components/ChatScreen";

export default function ChatRoute() {
  const params = useParams<{ id: string }>();
  return <ChatScreen key={params.id} sessionId={params.id} />;
}
