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

import { fetchMILogo } from './mi-logo';

describe('fetchMILogo', () => {
  const originalFetch = global.fetch;
  const createObjectURL = jest.fn();

  beforeEach(() => {
    (URL as unknown as { createObjectURL: jest.Mock }).createObjectURL = createObjectURL;
    createObjectURL.mockReturnValue('blob:logo');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('turns the returned bytes into an image URL and caches it per id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ blobContent: [137, 80, 78, 71] }),
    }) as unknown as typeof fetch;

    await expect(fetchMILogo('logo-ok')).resolves.toBe('blob:logo');
    await fetchMILogo('logo-ok');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/connectors/logo-ok/logo'));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(4);
  });

  it('returns null when the request fails or has no image', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    await expect(fetchMILogo('logo-404')).resolves.toBeNull();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(fetchMILogo('logo-empty')).resolves.toBeNull();

    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(fetchMILogo('logo-err')).resolves.toBeNull();
  });
});
