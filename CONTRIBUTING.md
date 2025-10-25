# Contributing to Gateway Trading Bot

Thank you for your interest in contributing! This project was built for the Solana Cypherpunk Hackathon, but we welcome improvements.

## How to Contribute

### Reporting Bugs
- Check if the bug has already been reported in Issues
- If not, create a new issue with:
  - Clear title and description
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Node version, etc.)

### Suggesting Enhancements
- Open an issue with tag `enhancement`
- Describe the feature and why it's needed
- Provide examples if possible

### Pull Requests
1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m "Add: your feature description"`
6. Push: `git push origin feature/your-feature-name`
7. Open a Pull Request

## Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/gateway-trading-bot
cd gateway-trading-bot

# Install dependencies
cd backend && npm install
cd ../dashboard && npm install

# Setup environment
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# Run tests (if available)
npm test

# Start development
# Terminal 1
cd backend && npm start

# Terminal 2
cd dashboard && npm run dev
```

## Code Style

- Use ES6+ features
- Follow existing code formatting
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable names

## Testing

- Test on devnet before mainnet
- Verify all API endpoints work
- Check dashboard updates correctly
- Ensure error handling works

## Documentation

- Update README.md for new features
- Add inline comments for complex code
- Update API documentation if endpoints change

## Questions?

Open an issue or reach out via:
- GitHub: [@Ore0luwa](https://github.com/Ore0luwa)
- Twitter: [@AishatOladipup4](https://x.com/AishatOladipup4)

Thank you for contributing! 🚀
