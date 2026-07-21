export class ModelTimeoutError extends Error {
  constructor() {
    super('Model call timed out');
    this.name = 'ModelTimeoutError';
  }
}

export class MissingApiKeyError extends Error {
  readonly envKey: string;

  constructor(envKey: string) {
    super(`Missing API key for ${envKey}. Set ${envKey} or run \`zencommit auth login\`.`);
    this.name = 'MissingApiKeyError';
    this.envKey = envKey;
  }
}
