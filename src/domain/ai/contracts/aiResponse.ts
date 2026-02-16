// AI Response Contract - Type definitions for responses from AI engine
export type AiInsight = {
  id: string;
  title: string;
  text: string;
  severity?: "info" | "warn" | "success";
};

export type AiAction =
  | { type: "SHOW_SCENARIO"; scenarioId: string }
  | { type: "SUGGEST_GOAL_UPDATE"; sport: "run" | "ride"; goalPatch: any }
  | { type: "OPEN_SETTINGS" };

export type AiResponse = {
  version: "1.0";
  summaryText: string;
  insights: AiInsight[];
  actions?: AiAction[];
};
