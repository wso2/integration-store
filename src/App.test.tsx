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

import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// App builds its own theme; give the provider the test theme the page tests use.
jest.mock('@wso2/oxygen-ui', () => {
  const actual = jest.requireActual('@wso2/oxygen-ui');
  const react = jest.requireActual('react');
  const { lightTheme } = jest.requireActual('@/styles/theme');
  return {
    ...actual,
    extendTheme: () => lightTheme,
    OxygenUIThemeProvider: ({ children }: { children: React.ReactNode }) =>
      react.createElement(actual.OxygenUIThemeProvider, { theme: lightTheme }, children),
  };
});
jest.mock('./pages/HomePage', () => () => <div>home page</div>);
jest.mock('./pages/ConnectorDetailPage', () => () => <div>connector page</div>);
jest.mock('./pages/MIOnlyDetailPage', () => () => <div>mi-only page</div>);
jest.mock('@/components/WSO2Header', () => () => null);
jest.mock('@/components/Footer', () => () => null);

const renderAt = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('App routes', () => {
  beforeEach(() => {
    // CRA resets mock implementations between tests, which empties the matchMedia stub
    // from setupTests.ts; the theme provider reads `.matches` from it.
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  it('renders the store at /', () => {
    renderAt('/');
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('renders the connector page for /connector/:org/:name', () => {
    renderAt('/connector/ballerinax/http');
    expect(screen.getByText('connector page')).toBeInTheDocument();
  });

  it('renders the MI-only page for /connector/wso2-mi/:id, not the Ballerina one', () => {
    renderAt('/connector/wso2-mi/mi-connector-pulsar');
    expect(screen.getByText('mi-only page')).toBeInTheDocument();
    expect(screen.queryByText('connector page')).not.toBeInTheDocument();
  });

  // public/index.html treats everything before "/connector/" as the deployment's base
  // path, so these are the URLs that reach the router and match no page. (Any other
  // unknown path is read as a base path, not as a route.)
  it.each(['/connector/ballerinax', '/connector/ballerinax/http/1.0.0/extra'])(
    'shows a not-found page with a way back for %s, not a blank page',
    (path) => {
      renderAt(path);
      expect(screen.getByText('Page not found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back to store' })).toBeInTheDocument();
    }
  );
});
