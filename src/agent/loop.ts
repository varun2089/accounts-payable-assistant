import { buildCaseMessage } from './buildCaseMessage.js';
import { checkEvidence } from './evidenceCheck.js';
import { allToolImplementations, modelFacingToolDefinitions } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { validateAgentOutput } from './validateOutput.js';
import { getAnthropicClient, getModelName } from '../llm/client.js';
import type {
  ContentBlock,
  Message,
  MessageParam,
  TextBlock,
  ToolDefinition,
  ToolResultBlockParam,
  ToolUseBlock,
} from '../llm/client.js';
import type {
  AgentRunOutcome,
  EvidenceCheckFailure,
  ProcessingRequest,
  ToolCallRecord,
  ValidatedAgentOutput,
} from '../types.js';

type AgentLoopResult = {
  status: 'COMPLETED' | 'MAX_STEPS_EXCEEDED';
  finalText: string | null;
  steps: number;
  transcript: MessageParam[];
  toolResultsByName: Record<string, ToolCallRecord[]>;
};

type ToolRun = {
  name: string;
  recorded: ToolCallRecord;
  block: ToolResultBlockParam;
};

const MAX_STEPS: number = 8;
const MAX_TOKENS: number = 8192;

const MODEL_FACING_TOOL_NAMES: Set<string> = new Set<string>(
  modelFacingToolDefinitions.map((tool: ToolDefinition): string => tool.name),
);

const isToolUseBlock = (block: ContentBlock): block is ToolUseBlock => block.type === 'tool_use';

const isTextBlock = (block: ContentBlock): block is TextBlock => block.type === 'text';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const extractText = (content: ContentBlock[]): string | null => {
  const text: string = content
    .filter(isTextBlock)
    .map((block: TextBlock): string => block.text)
    .join('\n')
    .trim();
  return text === '' ? null : text;
};

const toToolError = (block: ToolUseBlock, message: string): ToolRun => ({
  name: block.name,
  recorded: { input: block.input, result: { toolError: message } },
  block: { type: 'tool_result', tool_use_id: block.id, content: message, is_error: true },
});

const runTool = async (block: ToolUseBlock): Promise<ToolRun> => {
  const implementation: ((input: any, approvedBy?: string) => Promise<unknown>) | undefined =
    MODEL_FACING_TOOL_NAMES.has(block.name) ? allToolImplementations[block.name] : undefined;

  if (!implementation) return toToolError(block, `unknown tool '${block.name}'`);

  try {
    const result: unknown = await implementation(block.input);
    return {
      name: block.name,
      recorded: { input: block.input, result },
      block: { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) },
    };
  } catch (error: unknown) {
    return toToolError(block, errorMessage(error));
  }
};

export const runAgentLoop = async (userMessage: string): Promise<AgentLoopResult> => {
  const messages: MessageParam[] = [{ role: 'user', content: userMessage }];
  const toolResultsByName: Record<string, ToolCallRecord[]> = {};

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const response: Message = await getAnthropicClient().messages.create({
      model: getModelName(),
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: modelFacingToolDefinitions,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUses: ToolUseBlock[] = response.content.filter(isToolUseBlock);

    if (toolUses.length === 0) {
      console.log(
        `[agent] step ${step}/${MAX_STEPS}: final answer (stop_reason ${response.stop_reason})`,
      );
      return {
        status: 'COMPLETED',
        finalText: extractText(response.content),
        steps: step,
        transcript: messages,
        toolResultsByName,
      };
    }

    console.log(
      `[agent] step ${step}/${MAX_STEPS}: tool call -> ${toolUses
        .map((block: ToolUseBlock): string => block.name)
        .join(', ')}`,
    );

    const toolRuns: ToolRun[] = await Promise.all(toolUses.map(runTool));
    for (const run of toolRuns) {
      (toolResultsByName[run.name] ??= []).push(run.recorded);
      if (run.block.is_error === true) {
        console.log(`[agent]   tool error (${run.name}): ${String(run.block.content)}`);
      }
    }
    messages.push({
      role: 'user',
      content: toolRuns.map((run: ToolRun): ToolResultBlockParam => run.block),
    });
  }

  console.log(`[agent] step budget of ${MAX_STEPS} exhausted without a final answer`);
  return {
    status: 'MAX_STEPS_EXCEEDED',
    finalText: null,
    steps: MAX_STEPS,
    transcript: messages,
    toolResultsByName,
  };
};

const requestCorrectedOutput = async (
  transcript: MessageParam[],
  validationErrors: string[],
): Promise<string | null> => {
  const correction: string =
    'Your previous response was not valid:\n' +
    validationErrors.map((error: string): string => `- ${error}`).join('\n') +
    '\nRespond again with ONLY the corrected JSON object matching the required schema, no other text.';

  const response: Message = await getAnthropicClient().messages.create({
    model: getModelName(),
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: modelFacingToolDefinitions,
    tool_choice: { type: 'none' },
    messages: [...transcript, { role: 'user', content: correction }],
  });

  return extractText(response.content);
};

export const runAgentCase = async (request: ProcessingRequest): Promise<AgentRunOutcome> => {
  const result: AgentLoopResult = await runAgentLoop(buildCaseMessage(request));
  if (result.status === 'MAX_STEPS_EXCEEDED') return { kind: 'MAX_STEPS_EXCEEDED' };

  const firstAttempt: ReturnType<typeof validateAgentOutput> = validateAgentOutput(
    result.finalText,
  );

  let output: ValidatedAgentOutput;
  if (firstAttempt.valid) {
    output = firstAttempt.data;
  } else {
    console.log(
      `[agent] output failed validation (${firstAttempt.errors.length} error(s)), retrying once`,
    );
    const retryText: string | null = await requestCorrectedOutput(
      result.transcript,
      firstAttempt.errors,
    );
    const secondAttempt: ReturnType<typeof validateAgentOutput> = validateAgentOutput(retryText);
    if (!secondAttempt.valid) {
      console.log('[agent] output still invalid after one retry');
      return {
        kind: 'MALFORMED_OUTPUT',
        rawText: retryText,
        validationErrors: secondAttempt.errors,
      };
    }
    output = secondAttempt.data;
  }

  if (output.proposedAction === 'NONE') return { kind: 'COMPLETED', output };

  const failedChecks: EvidenceCheckFailure[] = checkEvidence(
    output.proposedAction,
    result.toolResultsByName,
    request,
  );
  if (failedChecks.length > 0) {
    const reason: string =
      `model claimed ${output.proposedAction} but ` +
      failedChecks
        .map((failure: EvidenceCheckFailure): string => `${failure.tool} ${failure.observed}`)
        .join('; and ');
    const contradictingEvidence: Record<string, unknown> = Object.fromEntries(
      failedChecks
        .filter((failure: EvidenceCheckFailure): boolean => failure.latestResult !== null)
        .map((failure: EvidenceCheckFailure): [string, unknown] => [
          failure.tool,
          failure.latestResult,
        ]),
    );
    console.log(`[agent] unsupported recommendation: ${reason}`);
    return {
      kind: 'UNSUPPORTED_RECOMMENDATION',
      claimedAction: output.proposedAction,
      output,
      reason,
      ...(Object.keys(contradictingEvidence).length > 0 ? { contradictingEvidence } : {}),
    };
  }

  console.log(`[agent] ${output.proposedAction} passed evidence checks, awaiting human approval`);
  return { kind: 'NEEDS_APPROVAL', output, proposedAction: output.proposedAction };
};
