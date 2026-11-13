import { OFFICE_BOTS, type BotId } from "@/lib/office/allowlist";
import type { OccupantId } from "@/lib/office/assignments";

export type FigureMark = "bar" | "watch" | "house" | "flag" | "page" | "lens" | "play" | "none";
export type FigureShape = "bot" | "human";
export type FigureSilhouette = "blob" | "teardrop" | "sphere" | "star" | "capsule" | "diamond" | "cube" | "human";

export interface FigureSpec {
  occupantId: OccupantId;
  name: string;
  shape: FigureShape;
  silhouette: FigureSilhouette;
  body: string;
  head: string;
  mark: FigureMark;
  posture: "seated";
}

const BOT_FIGURES: Record<BotId, Omit<FigureSpec, "occupantId" | "name" | "posture">> = {
  "ad0c4d13-f85a-4f05-96e9-7edbf9ccdb54": {
    shape: "bot",
    silhouette: "blob",
    body: "#0b6b4a",
    head: "#083d2c",
    mark: "bar",
  },
  "7be15da5-b6fb-482d-af03-6a8bca938f30": {
    shape: "bot",
    silhouette: "teardrop",
    body: "#1d4ed8",
    head: "#1e3a8a",
    mark: "watch",
  },
  "3be017a1-3506-418c-8503-76ef3f55b57d": {
    shape: "bot",
    silhouette: "sphere",
    body: "#b45309",
    head: "#78350f",
    mark: "house",
  },
  "7d21784b-1021-4693-be2f-9d7ffd578722": {
    shape: "bot",
    silhouette: "star",
    body: "#be185d",
    head: "#831843",
    mark: "flag",
  },
  "4be523e7-0852-47d0-859e-efc51c4e8335": {
    shape: "bot",
    silhouette: "capsule",
    body: "#0f766e",
    head: "#134e4a",
    mark: "page",
  },
  "2d5decd1-e475-4c78-9281-85fc6baca121": {
    shape: "bot",
    silhouette: "diamond",
    body: "#6d28d9",
    head: "#4c1d95",
    mark: "lens",
  },
  "8a76c58f-cbf6-478b-93df-75075e074916": {
    shape: "bot",
    silhouette: "cube",
    body: "#c2410c",
    head: "#7c2d12",
    mark: "play",
  },
};

export const FIGURES: Record<OccupantId, FigureSpec> = {
  stavros: {
    occupantId: "stavros",
    name: "Stavros",
    shape: "human",
    silhouette: "human",
    body: "#9a3412",
    head: "#f0c9a0",
    mark: "none",
    posture: "seated",
  },
  ...Object.fromEntries(
    OFFICE_BOTS.map((bot) => [
      bot.id,
      {
        occupantId: bot.id,
        name: bot.name,
        posture: "seated" as const,
        ...BOT_FIGURES[bot.id],
      },
    ]),
  ),
} as Record<OccupantId, FigureSpec>;

export function figureForOccupant(occupantId: OccupantId | null): FigureSpec | null {
  if (!occupantId) return null;
  return FIGURES[occupantId] ?? null;
}

/** Identity color only. Missing ntfy status stays unknown and does not recolor the figure. */
export function presenceLabel(
  kind: "bot" | "human" | "empty",
  status: { status: string; step: string } | undefined,
): string {
  if (kind === "empty") return "Unassigned";
  if (kind === "human") return "Human caller. No bot status.";
  if (!status) return "No status received";
  return `${status.status} · ${status.step}`;
}
