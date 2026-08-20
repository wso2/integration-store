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
import { Breadcrumbs, Typography } from '@wso2/oxygen-ui';
import { ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { Link } from 'react-router-dom';

interface BreadcrumbsNavProps {
  connectorName: string;
}

const BreadcrumbsNav: React.FC<BreadcrumbsNavProps> = ({ connectorName }) => (
  <Breadcrumbs separator={<ChevronRight size={16} />} sx={{ fontSize: 14 }}>
    <Link
      to="/"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      WSO2 Integration Store
    </Link>
    <Typography variant="body2" color="text.primary">
      {connectorName}
    </Typography>
  </Breadcrumbs>
);

export default BreadcrumbsNav;
