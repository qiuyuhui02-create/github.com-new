export type ProviderId = "gemini" | "openrouter" | "doubao";
export type ProviderInfo = {
  id: ProviderId;
  name: string;
  model: string;
  ready: boolean;
  status: string;
  tier: "免费额度" | "免费模型" | "试用资格";
};
export type ComparisonResult = {
  provider: ProviderId;
  model: string;
  text?: string;
  error?: string;
};
