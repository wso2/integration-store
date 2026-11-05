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
 * Extracts only Overview text and Key Features from README content.
 * Strips all other subsections (setup, quickstart, etc.) that may appear
 * under the ## Overview heading.
 */
export function extractOverview(readme: string): string {
  const removeCodeBlocks = (text: string): string => text.replace(/```[\s\S]*?```/g, '').trim();
  const sections = readme.split(/(?=^## )/m);

  for (const section of sections) {
    const lowerSection = section.toLowerCase();
    // Match both "## Overview" and "## Package overview"
    if (lowerSection.startsWith('## overview') || lowerSection.startsWith('## package overview')) {
      // Split into subsections by ### headings
      const subsections = section.split(/(?=^### )/m);
      let content = subsections[0]; // Text before any ### heading (the overview prose)

      // Append Key Features subsection if present
      for (const sub of subsections) {
        if (/^###\s+key features\b/im.test(sub)) {
          // Keep only the heading and its bullet list, discard trailing non-bullet content
          const lines = sub.split('\n');
          let lastBulletIndex = -1;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const isBullet = /^\s*[-*+]\s/.test(line);
            const isContinuation = /^\s{2,}\S/.test(line);
            if (isBullet) {
              lastBulletIndex = i;
            } else if (lastBulletIndex !== -1 && line.trim() !== '' && !isContinuation) {
              break;
            }
          }
          if (lastBulletIndex !== -1) {
            content += '\n' + lines.slice(0, lastBulletIndex + 1).join('\n');
          } else {
            content += '\n' + sub;
          }
          break;
        }
      }

      return removeCodeBlocks(content);
    }
  }

  // Fallback: use text before the first ## heading
  if (readme) {
    const firstHeaderIndex = readme.indexOf('## ');
    if (firstHeaderIndex > 0) {
      const introText = readme.substring(0, firstHeaderIndex).trim();
      if (introText) return removeCodeBlocks(introText);
    }
  }

  return '';
}

// "## Overview" or "## Package overview", the sections extractOverview reads
const OVERVIEW_HEADING = /^## (?:package )?overview\b/im;

interface OverviewSource {
  name: string;
  readme?: string;
  modules?: { name: string; readme?: string }[];
}

/**
 * Overview and Key features for a package, from the same README that Ballerina Central
 * shows. Central shows the README of the package's main module (modules[].readme), which
 * has the Overview and Key Features. The package-level README (readme) is often a short
 * "Package Overview" with neither, so it is the fallback.
 *
 * The main module is the one named like the package, or the first module.
 */
export function pickOverview(pkg: OverviewSource): string {
  const modules = pkg.modules ?? [];
  const mainModule = modules.find((m) => m.name === pkg.name) ?? modules[0];
  const moduleReadme = mainModule?.readme ?? '';
  const packageReadme = pkg.readme ?? '';

  if (OVERVIEW_HEADING.test(moduleReadme)) return extractOverview(moduleReadme);
  return extractOverview(packageReadme) || extractOverview(moduleReadme);
}
