"use server";

import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";

const ChatId = z.string().min(1).max(36);
const Title = z.string().trim().min(1).max(120);

/** Renames one of the shop's Assistant conversations. */
export async function renameChat(chatId: string, title: string): Promise<{ ok: boolean }> {
  const viewer = await requireWorkspace();
  const id = ChatId.safeParse(chatId);
  const name = Title.safeParse(title);
  if (!id.success || !name.success) return { ok: false };
  return { ok: await forWorkspace(viewer.workspace.id).renameChat(id.data, name.data) };
}

/** Deletes one of the shop's Assistant conversations; what it made (photos, drafts) stays. */
export async function deleteChat(chatId: string): Promise<{ ok: boolean }> {
  const viewer = await requireWorkspace();
  const id = ChatId.safeParse(chatId);
  if (!id.success) return { ok: false };
  return { ok: await forWorkspace(viewer.workspace.id).deleteChat(id.data) };
}
