export interface ModelLimits {
  context: number | null;
  input: number | null;
  output: number | null;
}

export interface ModelMetadata {
  id: string;
  name: string;
  limits: ModelLimits;
  pricing?: unknown;
  capabilities?: unknown;
}

export interface MetadataProvider {
  getModel(modelId: string): Promise<ModelMetadata | null>;
  search(query: string, limit?: number): Promise<ModelMetadata[]>;
  list?(): Promise<ModelMetadata[]>;
  refresh?(): Promise<void>;
}
