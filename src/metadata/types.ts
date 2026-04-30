export interface ModelLimits {
  context: number | null;
  input: number | null;
  output: number | null;
}

export interface ModelCapabilities {
  attachment?: unknown;
  reasoning?: unknown;
  temperature?: unknown;
  toolCall?: unknown;
  structuredOutput?: unknown;
  modalities?: unknown;
  family?: unknown;
  openWeights?: unknown;
  [key: string]: unknown;
}

export interface ModelMetadata {
  id: string;
  name: string;
  limits: ModelLimits;
  pricing?: unknown;
  capabilities?: ModelCapabilities;
}

export interface MetadataProvider {
  getModel(modelId: string): Promise<ModelMetadata | null>;
  search(query: string, limit?: number): Promise<ModelMetadata[]>;
  list?(): Promise<ModelMetadata[]>;
  refresh?(): Promise<void>;
}
