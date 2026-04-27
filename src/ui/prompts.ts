import { autocomplete, cancel, isCancel, password, select } from '@clack/prompts';
import { getProviderAuthConfigs } from '../auth/secrets.js';

export type ConfirmAction = 'commit' | 'edit' | 'cancel';

export const confirmCommit = async (message: string): Promise<ConfirmAction> => {
  const action = await select<ConfirmAction>({
    message: message.trim().length > 0 ? message : 'Commit message',
    options: [
      { value: 'commit', label: 'Commit' },
      { value: 'edit', label: 'Edit' },
      { value: 'cancel', label: 'Cancel' },
    ],
  });

  if (isCancel(action)) {
    cancel('Canceled');
    return 'cancel';
  }

  return action;
};

export const selectProviderKey = async (): Promise<string | null> => {
  const configs = getProviderAuthConfigs();
  const options = new Map<string, string>();
  for (const config of configs) {
    for (const envKey of config.envKeys) {
      if (!options.has(envKey)) {
        options.set(envKey, `${config.name} (${envKey})`);
      }
    }
  }

  const action = await autocomplete({
    message: 'Select provider key',
    options: Array.from(options.entries()).map(([value, label]) => ({ value, label })),
    placeholder: 'Type to search providers...',
    maxItems: 12,
  });

  if (isCancel(action)) {
    cancel('Canceled');
    return null;
  }

  return action;
};

export const promptForSecret = async (envKey: string): Promise<string | null> => {
  const value = await password({
    message: `Enter ${envKey}`,
    mask: '*',
  });

  if (isCancel(value)) {
    cancel('Canceled');
    return null;
  }

  return value;
};

export const promptForModelSelection = async (
  options: Array<{ id: string; name: string }>,
  initialInput?: string,
  maxItems = 10,
): Promise<string | null> => {
  const value = await autocomplete({
    message: 'Search models',
    options: options.map((model) => ({
      value: model.id,
      label: model.id,
      hint: model.name,
    })),
    placeholder: 'Type to search models...',
    maxItems,
    initialUserInput: initialInput,
  });

  if (isCancel(value)) {
    cancel('Canceled');
    return null;
  }

  return value;
};
