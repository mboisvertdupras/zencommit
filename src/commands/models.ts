import { createMetadataResolver } from '../metadata/index.js';
import { ConfigLoadError, resolveConfig } from '../config/load.js';
import { getRepoRoot } from '../git/repo.js';
import { promptForModelSelection } from '../ui/prompts.js';
import { logVerbose } from '../util/logger.js';

export const runModelsSearch = async (query?: string, maxItems = 10): Promise<void> => {
  try {
    const repoRoot = await getRepoRoot();
    logVerbose(1, `models search: repo root ${repoRoot ?? 'unknown'}`);
    const config = await resolveConfig(repoRoot);
    const resolver = createMetadataResolver(config.metadata, repoRoot);
    const list = resolver.list ? await resolver.list() : [];
    const models = list.length > 0 ? list : query ? await resolver.search(query) : [];
    logVerbose(2, `models search: candidates=${models.length}`);
    if (models.length === 0) {
      console.log('No models found.');
      return;
    }

    const selectedId = await promptForModelSelection(
      models.map((model) => ({ id: model.id, name: model.name })),
      query,
      maxItems,
    );
    if (!selectedId) {
      return;
    }

    const selected =
      models.find((model) => model.id === selectedId) ?? (await resolver.getModel(selectedId));
    if (selected) {
      console.log(JSON.stringify(selected, null, 2));
    } else {
      console.log(selectedId);
    }
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
};

export const runModelsInfo = async (modelId: string): Promise<void> => {
  try {
    const repoRoot = await getRepoRoot();
    logVerbose(1, `models info: repo root ${repoRoot ?? 'unknown'}`);
    const config = await resolveConfig(repoRoot);
    const resolver = createMetadataResolver(config.metadata, repoRoot);
    const model = await resolver.getModel(modelId);
    if (!model) {
      console.error(`Model not found: ${modelId}`);
      console.error('Try switching metadata providers or providing a local metadata file.');
      process.exit(2);
    }

    console.log(JSON.stringify(model, null, 2));
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
};
