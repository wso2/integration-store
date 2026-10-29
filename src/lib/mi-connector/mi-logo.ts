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

import { useEffect, useState } from 'react';

const MI_CONNECTOR_API_BASE =
  'https://apis.wso2.com/qgpf/connector-store-backend/endpoint-9090-803/v1.0';

interface MILogoResponse {
  /** PNG file as a list of byte values. */
  blobContent?: number[];
}

const logoCache = new Map<string, Promise<string | null>>();

/**
 * Logo of an MI connector as an object URL, or null when there is none.
 * The store API returns the image bytes inside JSON, so they are turned into a Blob here.
 */
export function fetchMILogo(id: string): Promise<string | null> {
  const cached = logoCache.get(id);
  if (cached) return cached;
  const request = (async () => {
    try {
      const response = await fetch(
        `${MI_CONNECTOR_API_BASE}/connectors/${encodeURIComponent(id)}/logo`
      );
      if (!response.ok) return null;
      const { blobContent } = (await response.json()) as MILogoResponse;
      if (!Array.isArray(blobContent) || blobContent.length === 0) return null;
      return URL.createObjectURL(new Blob([new Uint8Array(blobContent)], { type: 'image/png' }));
    } catch {
      return null;
    }
  })();
  logoCache.set(id, request);
  return request;
}

/** Logo URL for an MI connector id, undefined until loaded or when unavailable. */
export function useMILogo(id: string | undefined): string | undefined {
  const [logo, setLogo] = useState<string | undefined>();
  useEffect(() => {
    setLogo(undefined);
    if (!id) return undefined;
    let active = true;
    fetchMILogo(id).then((url) => {
      if (active && url) setLogo(url);
    });
    return () => {
      active = false;
    };
  }, [id]);
  return logo;
}
