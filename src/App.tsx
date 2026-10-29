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

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { OxygenUIThemeProvider, extendTheme, OxygenTheme } from '@wso2/oxygen-ui';
import HomePage from './pages/HomePage';
import ConnectorDetailPage from './pages/ConnectorDetailPage';
import MIOnlyDetailPage from './pages/MIOnlyDetailPage';
import NotFoundPage from './pages/NotFoundPage';

declare global {
  interface Window {
    __BASE_PATH__?: string;
  }
}

// Create a custom theme by extending the base OxygenTheme
const theme = extendTheme(OxygenTheme);

function App() {
  return (
    <OxygenUIThemeProvider themes={[{ key: 'default', label: 'Default', theme }]}>
      <Router
        basename={window.__BASE_PATH__ || ''}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/connector/wso2-mi/:id" element={<MIOnlyDetailPage />} />
          <Route path="/connector/:org/:name" element={<ConnectorDetailPage />} />
          <Route path="/connector/:org/:name/:version" element={<ConnectorDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </OxygenUIThemeProvider>
  );
}

export default App;
