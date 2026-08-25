# Contributing to WSO2 Integration Store

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Review Process](#code-review-process)

## Getting Started

### Prerequisites

- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher
- **Git**: For version control

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd integration-store
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```
   The application will be available at [http://localhost:3000](http://localhost:3000)

## 💻 Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Creating a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### Keeping Your Branch Updated

```bash
git checkout main
git pull origin main
git checkout feature/your-feature-name
git rebase main
```

## Code Standards

### TypeScript

- **Strict mode enabled** - All code must pass TypeScript strict checks
- **Explicit types** - Avoid `any`, use specific types or `unknown`
- **No unused variables** - Prefix with `_` if intentionally unused

### Code Style

We use **ESLint** and **Prettier** for code quality and formatting:

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without making changes
npm run format:check
```

### Code Quality Rules

- **No console.log** - Use `console.warn()` or `console.error()` for logging
- **Functional components** - Use React hooks, avoid class components
- **Memoization** - Use `useMemo` and `useCallback` for expensive operations
- **Descriptive names** - Variables and functions should be self-documenting

### Component Guidelines

- Keep components **focused and small** (< 300 lines)
- Use **Material-UI components** for UI consistency
- Follow the **existing component structure**:
  ```tsx
  // 1. Imports
  // 2. Type definitions
  // 3. Component definition
  // 4. Styled components (if any)
  // 5. Export
  ```

### File Organization

```
src/
├── pages/        # CRA/React pages
├── components/   # Reusable React components
├── lib/          # Utility functions and API clients
├── styles/       # Theme and global styles
└── types/        # TypeScript type definitions
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- **Unit tests** - For utilities and pure functions
- **Component tests** - For React components
- **Integration tests** - For user flows

Example test structure:

```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // Test implementation
  });

  it('should handle user interaction', () => {
    // Test implementation
  });
});
```

### Test Requirements

- All new features must include tests
- Aim for **80%+ code coverage**
- Tests must pass before submitting PR

## 📤 Submitting Changes

### Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(search): add real-time search across connectors

fix(pagination): correct page calculation for filtered results

docs(readme): update installation instructions
```

### Pre-commit Checklist

Before committing, ensure:

- [ ] Code passes `npm run lint`
- [ ] Code is formatted with `npm run format`
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] All tests pass (`npm test`)
- [ ] New features include tests
- [ ] Documentation is updated

### Creating a Pull Request

1. **Push your branch**

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create PR on GitHub**
   - Use a descriptive title
   - Fill out the PR template
   - Link related issues
   - Add screenshots for UI changes

3. **PR Description Should Include:**
   - Summary of changes
   - Motivation and context
   - Testing performed
   - Screenshots (for UI changes)
   - Breaking changes (if any)

## 👀 Code Review Process

### What Reviewers Look For

- Code quality and readability
- Test coverage
- Performance implications
- Security considerations
- Adherence to project standards

### Responding to Feedback

- Address all comments
- Ask questions if unclear
- Push additional commits to the same branch
- Mark conversations as resolved when addressed

### Approval Requirements

- At least **1 approval** from a maintainer
- All CI checks must pass
- No unresolved conversations

## Development Tips

### Hot Reload

The development server supports hot reload. Changes to source files will automatically refresh the browser.

### TypeScript Type Checking

```bash
# Watch mode for continuous type checking
npx tsc --watch

# Single run
npx tsc --noEmit
```

### Debugging

- Use browser DevTools for client-side debugging
- Check the console for errors and warnings
- Use React DevTools extension for component inspection

### Performance Profiling

Use React DevTools Profiler to identify performance bottlenecks.

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Material-UI Documentation](https://mui.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)

## ❓ Questions?

- Check existing [Issues](../../issues) and [Discussions](../../discussions)
- Review the [README](./README.md) for project overview
- Contact the WSO2 development team

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

**Thank you for contributing to WSO2 Integration Store!**
