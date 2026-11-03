/*
 Copyright (c) 2026 WSO2 LLC. (http://www.wso2.com) All Rights Reserved.

 WSO2 LLC. licenses this file to you under the Apache License,
 Version 2.0 (the "License"); you may not use this file except
 in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

/**
 * Finds and removes mentions of the Ballerina language from package overviews and card
 * summaries, on the store side, so no package README has to be edited one by one.
 *
 * Scope: only the wording that names the Ballerina LANGUAGE in the overview, key features and summary.
 * Package identifiers (`ballerinax/github`), URLs, code, and table rows are never changed.
 *
 * How it works
 *   1. LINKS     "[Ballerina](url) connector" -> "connector" (a link whose text is just
 *                "Ballerina", followed by a word).
 *   2. PROTECT   code, inline code, link targets, bare URLs, HTML tags and table rows are
 *                swapped for placeholders.
 *   3. DROP      a sentence that only talks about the language ("Ballerina is an open-source
 *                language ...", "It is written in Ballerina.") is removed whole.
 *   4. REWRITE   the word is cut out where the sentence still reads fine without it
 *                ("Connects to X from Ballerina" -> "Connects to X",
 *                 "Ballerina GitHub connector" -> "GitHub connector",
 *                 "a client for the Ballerina language" -> "a client").
 *   5. RESTORE   placeholders are put back.
 *
 * Anything this does not recognise is left untouched and reported as `residual`, so a
 * surprising sentence is never silently mangled.
 */

interface Rule {
  id: string;
  description: string;
  example: [before: string, after: string];
}

interface SentenceRule extends Rule {
  test: RegExp;
}

interface ReplaceRule extends Rule {
  pattern: RegExp;
  // Receives the String.replace arguments: (match, ...groups, offset, whole string).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace: (...args: any[]) => string;
}

export interface RemovedMention {
  rule: string;
  kind: 'sentence' | 'phrase';
  match: string;
  context: string;
}

export interface KeptMention {
  kind: 'inline-code' | 'url';
  match: string;
}

export interface ResidualMention {
  kind: 'identifier-in-prose' | 'prose';
  match: string;
  context: string;
}

export interface MentionAnalysis {
  text: string;
  found: boolean;
  removed: RemovedMention[];
  kept: KeptMention[];
  residual: ResidualMention[];
}

export interface MentionOptions {
  /** Rule ids (see RULE_IDS) to switch off. */
  disable?: string[];
}

const OPEN = '\uE000';
const CLOSE = '\uE001';
const TOKEN_RE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

/** Sentences about the language itself: dropped whole. Tested against the masked sentence. */
const SENTENCE_RULES: SentenceRule[] = [
  {
    id: 'written-in',
    example: ['Sends email. It is written in Ballerina.', 'Sends email.'],
    description:
      'a short sentence that only says it is written in Ballerina ("It is written in Ballerina.")',
    test: /^\s*(?:It|This|The\s+\w+)\s+(?:is|was)\s+(?:written|implemented|built|developed)\s+(?:in|using|with)\s+(?:the\s+)?Ballerina\b[^.]{0,30}\.?\s*$/i,
  },
  {
    id: 'about-language',
    example: ['Ballerina is an open-source language. Sends email.', 'Sends email.'],
    description: 'describes the Ballerina language or platform itself ("Ballerina is ...")',
    test: new RegExp(
      `^[^A-Za-z]*(?:the\\s+)?Ballerina(?:\\s+(?:programming\\s+)?(?:language|platform))?\\s+` +
        `(?:is|provides|offers|has|makes|lets|allows|supports|enables|comes)\\b`,
      'i'
    ),
  },
  {
    id: 'link-to-ballerina',
    example: ['Made with [Ballerina](https://ballerina.io). Sends email.', 'Sends email.'],
    description: 'contains a link whose text is just "Ballerina" / "Ballerina docs" / ...',
    test: new RegExp(
      `\\[\\s*(?:the\\s+)?Ballerina(?:\\s+(?:programming\\s+)?` +
        `(?:language|Central|docs?|documentation|website|home\\s*page))?\\s*\\]${OPEN}`,
      'i'
    ),
  },
];

const NOUNS =
  '(?:connector|module|package|library|client|extension|integration|standard library|stdlib|SDK|' +
  'program|application|app|project|code|service)s?';

// Does the text at `offset` start a sentence? After a list marker / heading, after a full stop
// on the same line, or at the start of a line that follows a paragraph break or a finished
// sentence. A line that only continues a wrapped sentence does not.
const startsSentence = (str: string, offset: number): boolean => {
  const lineStart = str.lastIndexOf('\n', offset - 1) + 1;
  const prefix = str.slice(lineStart, offset);
  if (/^[ \t]*(?:[-*+]|\d+\.|#{1,6})[ \t]+$/.test(prefix)) return true;
  if (/[.!?][ \t]+$/.test(prefix)) return true;
  if (!/^[ \t]*$/.test(prefix)) return false;
  const before = str.slice(0, lineStart);
  return (
    before === '' ||
    /\n[ \t]*\n$/.test(before) ||
    /[.!?:]\s*$/.test(before) ||
    /(?:^|\n)[ \t]*#{1,6}[ \t][^\n]*\n$/.test(before)
  );
};
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Phrases cut out of sentences that stay. Applied in order to the masked text. */
const REPLACE_RULES: ReplaceRule[] = [
  {
    id: 'for-the-language',
    example: ['A client for the Ballerina language.', 'A client.'],
    description: '"(for|in|with|using ...) the Ballerina language"',
    pattern:
      /(?:\s+(?:for|in|with|using|on|via|by))?\s+(?:the\s+)?Ballerina(?:\s+programming)?\s+language\b/gi,
    replace: () => '',
  },
  {
    id: 'written-in-phrase',
    example: ['A HL7 client implemented in Ballerina.', 'A HL7 client.'],
    description: '"... implemented / written / built in Ballerina" at the end of a clause',
    pattern:
      /\s+(?:written|implemented|built|developed|designed)\s+(?:in|using|with)\s+(?:the\s+)?Ballerina(?=[.,;:!?)]|$)/gim,
    replace: () => '',
  },
  {
    id: 'trailing-preposition',
    example: ['Connects to Zoom API from Ballerina.', 'Connects to Zoom API.'],
    description: '"... for / in / with / using / from Ballerina" at the end of a clause',
    pattern: /\s+(?:for|in|with|using|on|via|from)\s+(?:the\s+)?Ballerina(?=[.,;:!?)]|$)/gim,
    replace: () => '',
  },
  {
    id: 'possessive',
    example: ["It uses Ballerina's HTTP client.", 'It uses HTTP client.'],
    description: '"Ballerina\'s ..."',
    pattern: /\bBallerina['’]s\s+/gi,
    replace: () => '',
  },
  {
    id: 'hyphenated-modifier',
    example: ['Uses Ballerina-based services.', 'Uses services.'],
    description: '"Ballerina-based / -native / -specific ..."',
    pattern: /\bBallerina-(?:based|native|specific|compatible|ready|powered)\s+(\S)/gi,
    replace: (_m, next, offset, str) => (startsSentence(str, offset) ? next.toUpperCase() : next),
  },
  {
    id: 'adjective-before-name',
    example: ['The Ballerina GitHub connector.', 'The GitHub connector.'],
    description: '"Ballerina GitHub connector" -> "GitHub connector"',
    pattern: new RegExp(`\\bBallerina\\s+(?!Central\\b|Swan\\s*Lake\\b)(?=[A-Z0-9${OPEN}])`, 'g'),
    replace: () => '',
  },
  {
    id: 'adjective-before-noun',
    example: ['Use the Ballerina module.', 'Use the module.'],
    description: '"Ballerina connector / module / package / program ..." -> "connector ..."',
    pattern: new RegExp(`\\b[Bb]allerina\\s+(${NOUNS}\\b)`, 'g'),
    replace: (_m, noun, offset, str) => (startsSentence(str, offset) ? capitalise(noun) : noun),
  },
  {
    id: 'preposition-before-word',
    example: ['Base package for Ballerina containing types.', 'Base package containing types.'],
    description: '"for Ballerina containing ..." -> "containing ..."',
    pattern: /\s+(?:for|in|with|using|on|via|from)\s+(?:the\s+)?Ballerina\s+(?=[a-z])/g,
    replace: () => ' ',
  },
  {
    id: 'adjective-generic',
    example: ['Convert into native Ballerina records.', 'Convert into native records.'],
    description:
      'any other "Ballerina <word>" ("Ballerina records", "a Ballerina job") -> "<word>"',
    pattern: new RegExp(
      `\\b[Bb]allerina\\s+(?!(?:Central|Swan|and|or|is|are|was|were|can|will|to|for|in|with|as|by|the|a|an|on|of|from|at|but|that|which)\\b)([A-Za-z])`,
      'g'
    ),
    replace: (_m, next, offset, str) => (startsSentence(str, offset) ? next.toUpperCase() : next),
  },
];

/**
 * Rules that run first, on the raw text (fenced code blocks set aside), because they rewrite
 * links, which the later stages protect.
 */
const PRE_RULES: ReplaceRule[] = [
  {
    id: 'link-after-using',
    example: [
      'Access data via the JDBC API using [Ballerina](https://ballerina.io/).',
      'Access data via the JDBC API.',
    ],
    description: '"... API using [Ballerina](url)." -> "... API." (drops the phrase)',
    pattern:
      /\s+using\s+\[\s*(?:the\s+)?Ballerina(?:\s+(?:programming\s+)?language)?\s*\]\([^)\n]*\)(?=[.,;:!?)]|\s*$)/gim,
    replace: () => '',
  },
  {
    id: 'link-before-word',
    example: [
      'The `ballerinax/x` is a [Ballerina](https://ballerina.io/) connector for Zoom.',
      'The `ballerinax/x` is a connector for Zoom.',
    ],
    description: '"a [Ballerina](url) connector for X" -> "a connector for X" (drops the link)',
    pattern:
      /\[\s*(?:the\s+)?Ballerina(?:\s+Swan\s*Lake)?(?:\s+(?:programming\s+)?language)?\s*\]\([^)\n]*\)\s*(?=[A-Za-z`[])/gi,
    replace: () => '',
  },
];

export const RULE_IDS = [...PRE_RULES, ...SENTENCE_RULES, ...REPLACE_RULES].map((r) => r.id);

function maskProtected(text: string): { masked: string; store: string[] } {
  const store: string[] = [];
  const keep = (m: string): string => {
    store.push(m);
    return `${OPEN}${store.length - 1}${CLOSE}`;
  };
  const masked = text
    .replace(/```[\s\S]*?```/g, keep)
    .replace(/`[^`\n]+`/g, keep)
    .replace(/\]\([^)\n]*\)/g, (m: string) => `]${keep(m.slice(1))}`)
    .replace(/<[^>\n]+>/g, keep)
    .replace(/https?:\/\/[^\s<>)\]]+/g, keep)
    .replace(/\b(?:e\.g|i\.e|etc|vs)\./gi, keep)
    .replace(/^[ \t]*\|.*$/gm, keep);
  return { masked, store };
}

const restore = (text: string, store: string[]): string =>
  text.replace(TOKEN_RE, (_m: string, i: string) => store[Number(i)]);

const contextAround = (str: string, index: number, length: number, store: string[]): string =>
  restore(str.slice(Math.max(0, index - 40), index + length + 40), store)
    .replace(/\s+/g, ' ')
    .trim();

/** Mentions that are kept on purpose: package identifiers in inline code, and URLs. */
function findKeptMentions(text: string): KeptMention[] {
  const kept: KeptMention[] = [];
  for (const m of text.matchAll(/`[^`\n]*ballerina[^`\n]*`/gi)) {
    kept.push({ kind: 'inline-code', match: m[0] });
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>)\]]*ballerina[^\s<>)\]]*/gi)) {
    kept.push({ kind: 'url', match: m[0] });
  }
  return kept;
}

function dropSentences(
  masked: string,
  store: string[],
  disabled: Set<string>,
  removed: RemovedMention[]
): string {
  const rules = SENTENCE_RULES.filter((r) => !disabled.has(r.id));
  const lines = masked.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (!/ballerina|swan\s*lake|\bbal\s/i.test(line)) {
      out.push(line);
      continue;
    }
    const m = line.match(/^([ \t]*(?:(?:[-*+]|\d+\.)[ \t]+|#{1,6}[ \t]+)?)([\s\S]*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const prefix = m[1];
    const sentences = m[2].replace(/([.!?]+)(\s+)/g, '$1$2\u0001').split('\u0001');
    const kept: string[] = [];
    for (const sentence of sentences) {
      const rule = rules.find((r) => r.test.test(sentence));
      if (rule) {
        removed.push({
          rule: rule.id,
          kind: 'sentence',
          match: restore(sentence, store).trim(),
          context: restore(line, store).trim(),
        });
      } else {
        kept.push(sentence);
      }
    }
    if (kept.length === sentences.length) {
      out.push(line);
      continue;
    }
    const rest = kept.join('').trim();
    if (rest) out.push(prefix + rest);
    // else: every sentence on the line was about the language, so the line goes.
  }
  return out.join('\n');
}

function applyRules(
  text: string,
  rules: ReplaceRule[],
  store: string[],
  disabled: Set<string>,
  removed: RemovedMention[]
): string {
  let out = text;
  for (const rule of rules) {
    if (disabled.has(rule.id)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out = out.replace(rule.pattern, (...args: any[]) => {
      const replacement = rule.replace(...args);
      if (replacement === args[0]) return replacement; // rule declined this match
      // args = [match, ...groups, offset, whole string]
      const offset = args[args.length - 2];
      const whole = args[args.length - 1];
      removed.push({
        rule: rule.id,
        kind: 'phrase',
        match: restore(args[0], store).trim(),
        context: contextAround(whole, offset, args[0].length, store),
      });
      return replacement;
    });
  }
  return out;
}

/** Analyse and clean one overview or summary. */
export function analyzeBallerinaMentions(
  markdown: string,
  options: MentionOptions = {}
): MentionAnalysis {
  const input = typeof markdown === 'string' ? markdown : '';
  const disabled = new Set(options.disable || []);
  const result: MentionAnalysis = {
    text: input,
    found: /ballerina/i.test(input),
    removed: [],
    kept: [],
    residual: [],
  };
  if (!result.found) return result;

  // 1. rewrite links and identifiers on the raw text (fenced code set aside)
  const fences: string[] = [];
  const withoutFences = input.replace(/```[\s\S]*?```/g, (m: string) => {
    fences.push(m);
    return `\uE002${fences.length - 1}\uE003`;
  });
  const pre = applyRules(withoutFences, PRE_RULES, [], disabled, result.removed);

  // 2. protect, drop language-only sentences, rewrite phrases
  const { masked, store } = maskProtected(pre);
  let working = dropSentences(masked, store, disabled, result.removed);
  working = applyRules(working, REPLACE_RULES, store, disabled, result.removed);

  working = working
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (const m of working.matchAll(/ballerinax?\b/gi)) {
    const index = m.index ?? 0;
    const after = working.slice(index + m[0].length, index + m[0].length + 40);
    result.residual.push({
      kind: /^\/[\w.-]+/.test(after) ? 'identifier-in-prose' : 'prose',
      match: m[0],
      context: contextAround(working, index, m[0].length, store),
    });
  }

  result.text = restore(working, store).replace(/\uE002(\d+)\uE003/g, (_m: string, i: string) => fences[Number(i)]);
  result.kept = findKeptMentions(result.text);
  return result;
}

/** The text the store should show: the overview or summary with Ballerina mentions removed. */
export function stripBallerinaMentions(markdown: string, options?: MentionOptions): string {
  return analyzeBallerinaMentions(markdown, options).text;
}

/** Every rule, in the order it runs. */
export const ALL_RULES = [...PRE_RULES, ...SENTENCE_RULES, ...REPLACE_RULES];
