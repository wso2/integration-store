# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

The WSO2 Integration Store team takes security seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them through one of the following methods:

1. **Email**: Send details to [security@wso2.com](mailto:security@wso2.com)
2. **WSO2 Security Portal**: Visit [https://wso2.com/security](https://wso2.com/security)

### What to Include

When reporting a vulnerability, please include:

- **Description**: A clear description of the vulnerability
- **Impact**: Potential impact and severity assessment
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Proof of Concept**: Code snippets or screenshots if applicable
- **Affected Versions**: Which versions are affected
- **Suggested Fix**: If you have recommendations (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 7-14 days
  - High: 14-30 days
  - Medium: 30-60 days
  - Low: 60-90 days

### What to Expect

1. **Acknowledgment**: We'll confirm receipt of your report
2. **Assessment**: We'll assess the vulnerability and determine severity
3. **Updates**: Regular updates on fix progress
4. **Disclosure**: Coordinated disclosure after fix is released
5. **Credit**: We'll credit you in the security advisory (if desired)

## Security Best Practices

### For Users

- Keep your installation up to date with the latest version
- Follow the security guidelines in our documentation
- Use HTTPS for all deployments
- Implement proper authentication and authorization
- Regular security audits of your deployment

### For Contributors

- Follow secure coding practices
- Run security linters and tests before submitting PRs
- Never commit secrets, API keys, or credentials
- Review dependencies for known vulnerabilities (`npm audit`)
- Follow the principle of least privilege

## Known Security Considerations

### Current Implementation

- **Public API**: Uses public Ballerina Central API (no authentication required)
- **No User Data**: Application doesn't store or process user data
- **Client-Side Only**: All operations are client-side (no backend)
- **No Secrets**: No API keys or sensitive data in the application

### Dependencies

We regularly monitor and update dependencies to address security vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Fix auto-fixable vulnerabilities
npm audit fix
```

Current status: **0 known vulnerabilities**

## Security Headers

When deploying, ensure the following security headers are configured:

- `Content-Security-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Strict-Transport-Security`
- `Referrer-Policy`

Example Next.js configuration:

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

## Disclosure Policy

- **Coordinated Disclosure**: We practice responsible disclosure
- **Security Advisories**: Published via GitHub Security Advisories
- **CVE Assignment**: For applicable vulnerabilities
- **Public Disclosure**: After fix is released and users have time to update

## Hall of Fame

We recognize security researchers who help make our project safer:

_No reports yet - be the first!_

## Contact

- **General Security Questions**: [security@wso2.com](mailto:security@wso2.com)
- **Project Team**: See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

**Thank you for helping keep WSO2 Integration Store secure!**
