/*
 Copyright (c) 2026 WSO2 LLC. (http://www.wso2.com).

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

import fs from 'fs';
import os from 'os';
import path from 'path';

// scripts/*.js are plain CommonJS that run at build time.
type Verify = { verifyPriorityCatalogue: (filePath: string) => { totalCount: number } };
type Generator = { skipRequested: (env: Record<string, string | undefined>) => boolean };

let verify: Verify;
let generator: Generator;
let dir: string;

const card = (i: number) => ({
  name: `pkg${i}`,
  organization: 'ballerinax',
  version: '1.0.0',
  URL: `/ballerinax/pkg${i}/1.0.0`,
  summary: 'A package',
  keywords: ['Type/Connector'],
  icon: 'icon.png',
  createdDate: 1700000000000,
  totalPullCount: 10,
  ratePerDay: 1,
});

const catalogue = (count: number) => {
  const packages = Array.from({ length: count }, (_, i) => card(i));
  return { generatedAt: 'now', centralCount: count, totalCount: count, packages };
};

const write = (content: string) => {
  const file = path.join(dir, 'priority-catalogue.json');
  fs.writeFileSync(file, content);
  return file;
};

beforeAll(async () => {
  verify = (await import('../../../scripts/verify-build.js' as string)) as Verify;
  generator = (await import(
    '../../../scripts/generate-priority-catalogue.js' as string
  )) as Generator;
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-build-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('verifyPriorityCatalogue', () => {
  it('accepts a complete catalogue', () => {
    expect(verify.verifyPriorityCatalogue(write(JSON.stringify(catalogue(120)))).totalCount).toBe(
      120
    );
  });

  it('fails when the file is missing', () => {
    expect(() => verify.verifyPriorityCatalogue(path.join(dir, 'nope.json'))).toThrow(/missing/);
  });

  it("fails on the SPA's HTML fallback", () => {
    expect(() => verify.verifyPriorityCatalogue(write('<!doctype html><html></html>'))).toThrow(
      /not valid JSON/
    );
  });

  it('fails when there is no packages array', () => {
    expect(() => verify.verifyPriorityCatalogue(write('{"totalCount":0}'))).toThrow(/packages/);
  });

  it('fails when the catalogue is too small', () => {
    expect(() => verify.verifyPriorityCatalogue(write(JSON.stringify(catalogue(5))))).toThrow(
      /expected at least/
    );
  });

  it('fails when totalCount does not match', () => {
    const page = { ...catalogue(120), totalCount: 99 };
    expect(() => verify.verifyPriorityCatalogue(write(JSON.stringify(page)))).toThrow(/totalCount/);
  });

  it('fails when a package is malformed', () => {
    const page = catalogue(120);
    page.packages[7] = { ...page.packages[7], URL: '' };
    expect(() => verify.verifyPriorityCatalogue(write(JSON.stringify(page)))).toThrow(
      /missing URL/
    );
  });
});

describe('skipRequested', () => {
  it('is false unless SKIP_PRIORITY_CATALOGUE=true', () => {
    expect(generator.skipRequested({})).toBe(false);
    expect(generator.skipRequested({ CI: 'true' })).toBe(false);
  });

  it('allows the skip for a local build', () => {
    expect(generator.skipRequested({ SKIP_PRIORITY_CATALOGUE: 'true' })).toBe(true);
  });

  it('refuses the skip in CI', () => {
    expect(() => generator.skipRequested({ SKIP_PRIORITY_CATALOGUE: 'true', CI: 'true' })).toThrow(
      /CI=true/
    );
  });
});
