export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  provider?: {
    name: string;
  };
  /** Price per million tokens: { input, output } */
  pricing?: {
    prompt: number;
    completion: number;
  };
  context_length?: number;
  supported_parameters?: string[];
  /** e.g. "anthropic", "openai", "google" */
  author?: string;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
  total_count: number;
}
