"use server";

import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import {
  createDesktopBackgroundCollection,
  deleteDesktopBackground,
  listDesktopBackgroundAssets,
  listDesktopBackgroundCollections,
  registerDesktopBackgroundImports,
  renameDesktopBackground,
  setDesktopBackgroundCollectionMembership,
  setDesktopBackgroundFavorite,
  setDesktopSetlistBackground,
  type ImportedDesktopBackground,
} from "@/lib/desktop/background-media";

async function teamId() {
  if (!isDesktopRuntime()) throw new Error("The Background Library is available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before using the Background Library.");
  return context.teamId;
}

export async function registerImportedDesktopBackgrounds(imports: ImportedDesktopBackground[], collectionName?: string) {
  const id = await teamId();
  registerDesktopBackgroundImports(id, imports);
  if (collectionName?.trim() && imports.length) {
    const existing = listDesktopBackgroundCollections(id).find((collection) => collection.name.toLowerCase() === collectionName.trim().toLowerCase());
    const collection = existing ?? createDesktopBackgroundCollection(id, collectionName);
    for (const asset of imports) setDesktopBackgroundCollectionMembership(id, asset.id, collection.id, true);
  }
  return getDesktopBackgroundLibrary();
}

export async function getDesktopBackgroundLibrary() {
  const id = await teamId();
  return {
    assets: listDesktopBackgroundAssets(id),
    collections: listDesktopBackgroundCollections(id),
  };
}

export async function renameDesktopBackgroundAction(assetId: string, name: string) {
  const id = await teamId();
  renameDesktopBackground(id, assetId, name);
  return getDesktopBackgroundLibrary();
}

export async function favoriteDesktopBackgroundAction(assetId: string, favorite: boolean) {
  const id = await teamId();
  setDesktopBackgroundFavorite(id, assetId, favorite);
  return getDesktopBackgroundLibrary();
}

export async function deleteDesktopBackgroundAction(assetId: string) {
  const id = await teamId();
  deleteDesktopBackground(id, assetId);
  return getDesktopBackgroundLibrary();
}

export async function createDesktopBackgroundCollectionAction(name: string) {
  const id = await teamId();
  createDesktopBackgroundCollection(id, name);
  return getDesktopBackgroundLibrary();
}

export async function setDesktopBackgroundCollectionAction(assetId: string, collectionId: string, enabled: boolean) {
  const id = await teamId();
  setDesktopBackgroundCollectionMembership(id, assetId, collectionId, enabled);
  return getDesktopBackgroundLibrary();
}

export async function assignDesktopSetlistBackgroundAction(setlistId: string, assetId: string | null) {
  const id = await teamId();
  setDesktopSetlistBackground(id, setlistId, assetId);
}
