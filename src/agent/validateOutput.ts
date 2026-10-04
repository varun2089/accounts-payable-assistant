import type { ProposedAction, ValidatedAgentOutput } from '../types.js';

const CONFIDENCE_LEVELS: string[] = ['HIGH', 'MEDIUM', 'LOW'];

const PROPOSED_ACTIONS: string[] = [
  'APPROVE_FOR_POSTING',
  'HOLD_FOR_INFORMATION',
  'REJECT_DUPLICATE',
  'REJECT_INVALID',
  'ESCALATE_CONTROL_REVIEW',
  'NONE',
];

const CODE_FENCE_RE: RegExp = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/;

const stripCodeFence = (text: string): string => {
  const trimmed: string = text.trim();
  const fenced: RegExpExecArray | null = CODE_FENCE_RE.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isConfidence = (value: unknown): value is ValidatedAgentOutput['confidence'] =>
  typeof value === 'string' && CONFIDENCE_LEVELS.includes(value);

const isProposedAction = (value: unknown): value is ProposedAction =>
  typeof value === 'string' && PROPOSED_ACTIONS.includes(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string');

const isCitation = (value: unknown): value is { documentId: string; heading: string } =>
  isRecord(value) &&
  typeof value['documentId'] === 'string' &&
  typeof value['heading'] === 'string';

const isCitationArray = (
  value: unknown,
): value is { documentId: string; heading: string }[] =>
  Array.isArray(value) && value.every(isCitation);

export const validateAgentOutput = (
  rawText: string | null,
): { valid: true; data: ValidatedAgentOutput } | { valid: false; errors: string[] } => {
  if (rawText === null) return { valid: false, errors: ['model produced no text output'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch (error: unknown) {
    return {
      valid: false,
      errors: [
        'output is not valid JSON: ' + (error instanceof Error ? error.message : String(error)),
      ],
    };
  }

  if (!isRecord(parsed)) {
    return { valid: false, errors: ['output must be a single JSON object'] };
  }

  const errors: string[] = [];

  const recommendation: unknown = parsed['recommendation'];
  const proposedAction: unknown = parsed['proposedAction'];
  const confidence: unknown = parsed['confidence'];
  const citedEvidence: unknown = parsed['citedEvidence'];
  const calculations: unknown = parsed['calculations'];
  const exceptions: unknown = parsed['exceptions'];
  const unknowns: unknown = parsed['unknowns'];
  const nextAction: unknown = parsed['nextAction'];

  if (!isNonEmptyString(recommendation)) {
    errors.push('recommendation must be a non-empty string');
  }
  if (!isProposedAction(proposedAction)) {
    errors.push(
      `proposedAction must be one of ${PROPOSED_ACTIONS.map(
        (action: string): string => `'${action}'`,
      ).join(', ')}`,
    );
  }
  if (!isConfidence(confidence)) {
    errors.push("confidence must be one of 'HIGH', 'MEDIUM' or 'LOW'");
  }
  if (!Array.isArray(citedEvidence)) {
    errors.push('citedEvidence must be an array');
  } else {
    citedEvidence.forEach((item: unknown, index: number): void => {
      if (!isCitation(item)) {
        errors.push(`citedEvidence[${index}] must have string documentId and string heading`);
      }
    });
  }
  if (!('calculations' in parsed)) {
    errors.push('calculations is required and must be an object or null');
  } else if (calculations !== null && !isRecord(calculations)) {
    errors.push('calculations must be an object or null');
  }
  if (!isStringArray(exceptions)) {
    errors.push('exceptions must be an array of strings');
  }
  if (!isStringArray(unknowns)) {
    errors.push('unknowns must be an array of strings');
  }
  if (!isNonEmptyString(nextAction)) {
    errors.push('nextAction must be a non-empty string');
  }

  if (
    errors.length > 0 ||
    !isNonEmptyString(recommendation) ||
    !isProposedAction(proposedAction) ||
    !isConfidence(confidence) ||
    !isCitationArray(citedEvidence) ||
    !isStringArray(exceptions) ||
    !isStringArray(unknowns) ||
    !isNonEmptyString(nextAction)
  ) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      recommendation,
      proposedAction,
      confidence,
      citedEvidence: citedEvidence.map(
        (item: { documentId: string; heading: string }): { documentId: string; heading: string } => ({
          documentId: item.documentId,
          heading: item.heading,
        }),
      ),
      calculations,
      exceptions,
      unknowns,
      nextAction,
    },
  };
};
