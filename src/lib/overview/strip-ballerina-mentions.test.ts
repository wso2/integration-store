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

import {
  ALL_RULES,
  analyzeBallerinaMentions,
  stripBallerinaMentions,
  RULE_IDS,
} from './strip-ballerina-mentions';
import { extractOverview, pickOverview } from './extract-overview';

describe('stripBallerinaMentions', () => {
  it('returns text without any mention unchanged', () => {
    const text = '## Overview\n\nSlack is a messaging platform.\n\n- Send messages';
    expect(stripBallerinaMentions(text)).toBe(text);
  });

  it('handles empty and non-string input', () => {
    expect(stripBallerinaMentions('')).toBe('');
    expect(stripBallerinaMentions(undefined as unknown as string)).toBe('');
  });

  describe('the word before a name, noun or modifier', () => {
    it('drops "Ballerina" before a capitalised name', () => {
      expect(stripBallerinaMentions('The Ballerina GitHub connector lets you manage repos.')).toBe(
        'The GitHub connector lets you manage repos.'
      );
    });

    it('drops "Ballerina" before connector/module/package and re-capitalises at a sentence start', () => {
      expect(stripBallerinaMentions('Ballerina connector for Salesforce.')).toBe(
        'Connector for Salesforce.'
      );
      expect(stripBallerinaMentions('Use the Ballerina module to send mail.')).toBe(
        'Use the module to send mail.'
      );
      expect(stripBallerinaMentions('- Ballerina package for Kafka')).toBe('- Package for Kafka');
    });

    it('works inside link text and before inline code', () => {
      expect(
        stripBallerinaMentions('The [Ballerina Slack connector](https://example.com/s) is here.')
      ).toBe('The [Slack connector](https://example.com/s) is here.');
      expect(stripBallerinaMentions('The Ballerina `edi` module converts text.')).toBe(
        'The `edi` module converts text.'
      );
    });

    it('drops a generic modifier but not "Ballerina and ..."', () => {
      expect(stripBallerinaMentions('Convert data into native Ballerina records.')).toBe(
        'Convert data into native records.'
      );
      expect(stripBallerinaMentions('Ballerina and Java mix.')).toBe('Ballerina and Java mix.');
    });

    it('only capitalises at a real sentence start, not on a wrapped line', () => {
      expect(
        stripBallerinaMentions('Handles data within\nBallerina applications. More text.')
      ).toBe('Handles data within\napplications. More text.');
      expect(stripBallerinaMentions('Intro.\n\nBallerina records are typed.')).toBe(
        'Intro.\n\nRecords are typed.'
      );
    });
  });

  describe('language phrases', () => {
    it('removes "for the Ballerina language"', () => {
      expect(stripBallerinaMentions('A client for the Ballerina language.')).toBe('A client.');
      expect(stripBallerinaMentions('APIs in the Ballerina programming language.')).toBe('APIs.');
    });

    it('removes a trailing "from / for / in / with Ballerina"', () => {
      expect(
        stripBallerinaMentions('Connects to [Zoom API](https://zoom.us/docs) from Ballerina.')
      ).toBe('Connects to [Zoom API](https://zoom.us/docs).');
      expect(stripBallerinaMentions('A connector for Twilio for Ballerina.')).toBe(
        'A connector for Twilio.'
      );
      expect(stripBallerinaMentions('Servers in Ballerina, enabling fast calls.')).toBe(
        'Servers, enabling fast calls.'
      );
    });

    it('removes a trailing "from Ballerina" glued to a link', () => {
      expect(
        stripBallerinaMentions(
          'Connects to [API](http://api.example.com/ui/index#/)from Ballerina.'
        )
      ).toBe('Connects to [API](http://api.example.com/ui/index#/).');
    });

    it('removes "for Ballerina" in front of a verb', () => {
      expect(stripBallerinaMentions('Base package for Ballerina containing data types.')).toBe(
        'Base package containing data types.'
      );
    });

    it('removes "implemented in Ballerina" but keeps the rest of the sentence', () => {
      expect(
        stripBallerinaMentions(
          'This is a HL7 v2 client implemented in Ballerina. It sends messages.'
        )
      ).toBe('This is a HL7 v2 client. It sends messages.');
    });

    it('removes possessive and hyphenated forms', () => {
      expect(stripBallerinaMentions("It uses Ballerina's HTTP client.")).toBe(
        'It uses HTTP client.'
      );
      expect(stripBallerinaMentions('Ballerina-based services are supported.')).toBe(
        'Services are supported.'
      );
    });
  });

  describe('links', () => {
    it('drops a "[Ballerina](url)" link in front of a word but keeps the sentence and name', () => {
      expect(
        stripBallerinaMentions('It is a [Ballerina](https://ballerina.io/) connector for Zoom.')
      ).toBe('It is a connector for Zoom.');
    });

    it('drops "using [Ballerina](url)" at the end of a clause', () => {
      expect(
        stripBallerinaMentions(
          'Access data via the JDBC API using [Ballerina](https://ballerina.io/).'
        )
      ).toBe('Access data via the JDBC API.');
    });

    it('drops a sentence whose only Ballerina content is a link to it', () => {
      expect(
        stripBallerinaMentions('Made with [Ballerina](https://ballerina.io). Sends email.')
      ).toBe('Sends email.');
    });
  });

  describe('sentences about the language itself', () => {
    it('drops "It is written in Ballerina." but keeps neighbours', () => {
      expect(
        stripBallerinaMentions(
          'Slack is a chat tool. It is written in Ballerina. It sends messages.'
        )
      ).toBe('Slack is a chat tool. It sends messages.');
    });

    it('drops "Ballerina is ..." sentences', () => {
      expect(
        stripBallerinaMentions('Ballerina is an open-source language. Real content stays.')
      ).toBe('Real content stays.');
    });

    it('removes a list item that only talks about Ballerina', () => {
      const text =
        '### Key features\n\n- Sends email\n- It is written in Ballerina.\n- Supports TLS';
      expect(stripBallerinaMentions(text)).toBe(
        '### Key features\n\n- Sends email\n- Supports TLS'
      );
    });

    it('does not split on version numbers or e.g.', () => {
      expect(
        stripBallerinaMentions('Supports v1.2 of the API, e.g. batching. Ballerina is great.')
      ).toBe('Supports v1.2 of the API, e.g. batching.');
    });
  });

  describe('package identifiers at the start of a sentence', () => {
    it('rewrites "The `ballerinax/x` is a connector for ..."', () => {
      expect(
        stripBallerinaMentions(
          'The `ballerinax/worldbank` is a connector for [World Bank API](http://a.b/c).'
        )
      ).toBe('A connector for [World Bank API](http://a.b/c).');
      expect(
        stripBallerinaMentions(
          'The `ballerinax/x` is a [Ballerina](https://ballerina.io/) connector for Zoom.'
        )
      ).toBe('A connector for Zoom.');
    });

    it('rewrites "The `ballerinax/x` package ..." and keeps the rest of the sentence', () => {
      expect(
        stripBallerinaMentions('The `ballerinax/openrouter` package offers APIs to connect.')
      ).toBe('This package offers APIs to connect.');
      expect(stripBallerinaMentions('- The `ballerina/data.csv` module converts CSV.')).toBe(
        '- This module converts CSV.'
      );
    });

    it('leaves an identifier alone when it is not at the start of a sentence', () => {
      const text =
        'Use it with the `ballerinax/slack` package. Wrapped\nthe `ballerinax/x` package.';
      expect(stripBallerinaMentions(text)).toBe(text);
    });
  });

  describe('left alone on purpose', () => {
    it('keeps package identifiers in inline code, fenced code, link targets and URLs', () => {
      const text =
        'Install `ballerinax/slack` from https://central.ballerina.io/ballerinax/slack and ' +
        '[docs](https://ballerina.io/learn).\n\n```ballerina\nimport ballerinax/slack;\n```';
      expect(stripBallerinaMentions(text)).toBe(text);
    });

    it('keeps table rows', () => {
      const table = '| | Version |\n|---|---|\n| Ballerina Language | Swan Lake 2201.1.1 |';
      expect(stripBallerinaMentions(table)).toBe(table);
    });

    it('does not mangle "Ballerina Central" or "Swan Lake"', () => {
      const text = 'Published on Ballerina Central. Needs Ballerina Swan Lake.';
      expect(stripBallerinaMentions(text)).toBe(text);
    });
  });

  describe('every rule', () => {
    it('does what its documented example says', () => {
      ALL_RULES.forEach((rule) => {
        expect([rule.id, stripBallerinaMentions(rule.example[0])]).toEqual([
          rule.id,
          rule.example[1],
        ]);
      });
    });
  });

  describe('analyzeBallerinaMentions', () => {
    it('reports removed, kept and residual mentions', () => {
      const result = analyzeBallerinaMentions(
        'The Ballerina Slack connector (`ballerinax/slack`) is fast. Ballerina and Java mix.'
      );
      expect(result.found).toBe(true);
      expect(result.removed.map((r) => r.rule)).toContain('adjective-before-name');
      expect(result.kept).toEqual([{ kind: 'inline-code', match: '`ballerinax/slack`' }]);
      expect(result.residual).toHaveLength(1);
      expect(result.residual[0].kind).toBe('prose');
      expect(result.text).toContain('Ballerina and Java mix.');
    });

    it('lets a rule be switched off', () => {
      const text = 'The Ballerina GitHub connector.';
      expect(
        stripBallerinaMentions(text, { disable: ['adjective-before-name', 'adjective-generic'] })
      ).toBe(text);
      expect(RULE_IDS).toContain('adjective-before-name');
    });
  });
});

describe('extractOverview', () => {
  it('keeps the overview prose, drops code blocks and later sections', () => {
    const readme = '## Overview\n\nHello.\n\n```bal\ncode\n```\n\n## Setup\n\nNope.';
    expect(extractOverview(readme)).toBe('## Overview\n\nHello.');
  });

  it('falls back to text before the first ## heading', () => {
    expect(extractOverview('Intro text.\n\n## Other\n\nx')).toBe('Intro text.');
  });
});

describe('pickOverview', () => {
  const moduleReadme =
    '## Overview\n\nGenerated connector.\n\n### Key Features\n\n- Feature one\n- Feature two\n\n## Prerequisites\n\nNope.';
  const packageReadme =
    'Short intro.\n\n## Package Overview\n\nPackage text.\n\n## Report issues\n\nx';

  it('uses the main module README (what Central shows), with its Key Features', () => {
    const text = pickOverview({
      name: 'openai.text',
      readme: packageReadme,
      modules: [{ name: 'openai.text', readme: moduleReadme }],
    });
    expect(text).toContain('Generated connector.');
    expect(text).toContain('### Key Features');
    expect(text).toContain('- Feature two');
    expect(text).not.toContain('Prerequisites');
    expect(text).not.toContain('Package text.');
  });

  it('picks the module named like the package, then the first module', () => {
    const modules = [
      { name: 'pkg.other', readme: '## Overview\n\nOther module.' },
      { name: 'pkg', readme: '## Overview\n\nMain module.' },
    ];
    expect(pickOverview({ name: 'pkg', readme: '', modules })).toBe('## Overview\n\nMain module.');
    expect(pickOverview({ name: 'unmatched', readme: '', modules })).toBe(
      '## Overview\n\nOther module.'
    );
  });

  it('falls back to the package README when the module README has no Overview', () => {
    const text = pickOverview({
      name: 'pkg',
      readme: packageReadme,
      modules: [{ name: 'pkg', readme: '## Usage\n\nOnly usage.' }],
    });
    expect(text).toBe('## Package Overview\n\nPackage text.');
  });

  it('falls back to the package README when there is no module README', () => {
    expect(pickOverview({ name: 'pkg', readme: packageReadme, modules: [] })).toBe(
      '## Package Overview\n\nPackage text.'
    );
    expect(pickOverview({ name: 'pkg', readme: packageReadme })).toBe(
      '## Package Overview\n\nPackage text.'
    );
  });

  it('uses the text before the first heading of the module README as a last resort', () => {
    expect(
      pickOverview({
        name: 'pkg',
        readme: '',
        modules: [{ name: 'pkg', readme: 'Intro.\n\n## Usage\n\nx' }],
      })
    ).toBe('Intro.');
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(pickOverview({ name: 'pkg' })).toBe('');
  });
});

describe('trailing-preposition: through / by', () => {
  it('removes "through Ballerina" at the end of a sentence', () => {
    expect(
      stripBallerinaMentions('Connects to the OneNote API through Ballerina. It can create pages.')
    ).toBe('Connects to the OneNote API. It can create pages.');
  });
});
