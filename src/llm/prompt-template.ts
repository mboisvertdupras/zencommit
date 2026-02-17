export type TemplateValue = string | number | boolean | null | undefined;

export type TemplateContext = Record<string, TemplateValue>;

const isTruthy = (value: TemplateValue): boolean => {
  if (value === null || value === undefined || value === false) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
};

const normalizeValue = (value: TemplateValue): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

export const renderTemplate = (template: string, context: TemplateContext): string => {
  let result = template;

  const conditionalPattern = /{{#if\s+([\w.-]+)\s*}}([\s\S]*?){{\/if}}/g;
  while (true) {
    const next = result.replace(conditionalPattern, (_, key: string, inner: string) => {
      const value = context[key];
      return isTruthy(value) ? inner : '';
    });
    if (next === result) {
      break;
    }
    result = next;
  }

  const variablePattern = /{{\s*([\w.-]+)\s*}}/g;
  result = result.replace(variablePattern, (_, key: string) => normalizeValue(context[key]));

  return result;
};

export const normalizePrompt = (value: string): string => value.replace(/\r\n/g, '\n').trim();
