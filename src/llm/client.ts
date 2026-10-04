import Anthropic from '@anthropic-ai/sdk';

const MODEL_NAME: string = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-5-5';

export type ToolDefinition = Anthropic.Tool;
export type Message = Anthropic.Message;
export type MessageParam = Anthropic.MessageParam;
export type ContentBlock = Anthropic.ContentBlock;
export type TextBlock = Anthropic.TextBlock;
export type ToolUseBlock = Anthropic.ToolUseBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

let client: Anthropic | null = null;

export const getAnthropicClient = (): Anthropic => {
  if (!client) client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
  return client;
};

export const getModelName = (): string => MODEL_NAME;
