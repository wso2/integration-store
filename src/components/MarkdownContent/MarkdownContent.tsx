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

import { Box } from '@wso2/oxygen-ui';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useEffect, useRef } from 'react';
import LightGallery from 'lightgallery/react';
import lgZoom from 'lightgallery/plugins/zoom';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-thumbnail.css';

declare global {
  interface Window {
    configs?: {
      lightGalleryKey?: string;
    };
  }
}

interface MarkdownContentProps {
  content: string;
  /** Unused: colours now come from the theme. Kept so existing callers still compile. */
  effectiveMode?: 'light' | 'dark';
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const galleryContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Extract all images from the rendered markdown
    if (galleryContainerRef.current) {
      const images = galleryContainerRef.current.querySelectorAll('img');
      images.forEach((img) => {
        // Add cursor pointer to indicate clickable
        img.style.cursor = 'pointer';
      });
    }
  }, [content]);

  // Access license key from window.configs
  const lightGalleryKey = window.configs?.lightGalleryKey || '';

  return (
    <Box ref={galleryContainerRef}>
      <LightGallery
        plugins={[lgZoom, lgThumbnail]}
        mode="lg-fade"
        speed={500}
        selector=".markdown-image"
        elementClassNames="markdown-gallery"
        licenseKey={lightGalleryKey}
      >
        <Box
          sx={{
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              mt: 4,
              mb: 2,
              fontWeight: 600,
              '&:first-of-type': { mt: 0 },
            },
            '& h2': { fontSize: '1.5rem', mt: 5 },
            '& h3': { fontSize: '1.25rem', mt: 4 },
            '& p': { my: 2, lineHeight: 1.8 },
            '& ul, & ol': { my: 2.5, pl: 3 },
            '& li': { my: 1 },
            '& a': {
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            '& img': {
              width: '60%',
              height: 'auto',
              borderRadius: 1,
              cursor: 'pointer',
              boxShadow: '0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19)',
            },
            '& li img': {
              marginBottom: '1rem',
            },
            '& li p img': {
              marginBottom: 0,
            },
            '& ul + .lg-react-element img': {
              marginTop: '1rem',
            },
            '& blockquote': {
              my: 3,
              py: 2,
              px: 3,
              borderLeft: '4px solid',
              borderRight: '0.1px solid',
              borderBottom: '0.1px solid',
              borderTop: '0.1px solid',
              borderColor: 'primary.main',
              bgcolor: 'transparent',
              borderRadius: 1,
              fontStyle: 'italic',
              color: 'text.primary',
              '& p': {
                my: 1,
                '&:first-of-type': { mt: 0 },
                '&:last-of-type': { mb: 0 },
              },
            },
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', fontWeight: '500' }}
                >
                  {children}
                </a>
              ),
              img: ({ src, alt }) => (
                <a href={src} className="markdown-image" data-src={src}>
                  <img src={src} alt={alt || ''} />
                </a>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </Box>
      </LightGallery>
    </Box>
  );
}
