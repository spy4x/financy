# Financy

Open-source, self-hostable finance tracking for individuals, families, and small
businesses.

Check it out at [financy.dev](https://financy.dev).

Financy is a double-entry financial
management web application focused on personal, family, and business expense
management. It emphasizes rich capabilities, transparency, and ease of use while
offering advanced features like group collaboration, public API integrations,
and Telegram bot integration.

## 🗺️ Development Roadmap

- ✅ **Completed** - 🟡 **In Progress** - ⚪ **Planned**

### 🏗️ Core Infrastructure

- ✅ **Database Schema** - Complete PostgreSQL schema with all tables
- ✅ **CQRS Architecture** - Command/Event pattern with buses
- ✅ **Real-time Communication** - WebSocket implementation
- ✅ **Caching & Performance** - Valkey/Redis caching layer
- ✅ **Containerization** - Docker setup for all services
- ✅ **PWA Foundation** - Progressive Web App capabilities
- 🟡 **Authentication System** - Basic auth complete, 2FA UI pending

### 👥 User Management

- 🟡 **User Registration/Login** - Basic flow complete, profile management needed
- ✅ **Session Management** - Secure session handling
- 🟡 **Role-Based Access Control** - Multi-tier permissions partially implemented
- 🟡 **Two-Factor Authentication** - Backend ready, UI needs completion
- 🟡 **Password Management** - Basic change functionality, reset needs work
- ⚪ **User Profile Management** - Profile editing, preferences
- ⚪ **Account Recovery** - Email-based recovery system

### 🏢 Group Collaboration

- 🟡 **Group Management** - Create, edit, list groups
- ✅ **Group Settings** - Default currencies, preferences
- ✅ **Real-time Updates** - Live sync across group members
- 🟡 **Group Membership** - Role-based access partially implemented
- ⚪ **Member Invitations** - Invite users via email/link
- ⚪ **Member Management** - Add/remove group members

### 🏦 Account Management

- ✅ **Account CRUD** - Complete create, read, update, delete
- ✅ **Account Management UI** - Edit details, currencies, balances
- ✅ **Account List & Balances** - View all accounts with current balances
- ✅ **Account Archiving** - Soft delete with undelete functionality
- 🟡 **Multi-Currency Display** - Show amounts in different currencies
- ⚪ **Cross-Group Sharing** - Share accounts between multiple groups

### 📊 Transaction Management

- ✅ **Transaction CRUD** - Complete transaction management via WebSockets
- ✅ **Multi-Currency Support** - Original + converted amounts
- ✅ **Transaction Forms** - Add income/expense/transfer forms
- ✅ **Transaction History** - View and filter transaction list
- ✅ **Transaction Editing** - Modify existing transactions
- ✅ **Transaction Archiving** - Soft delete with undelete
- ⚪ **Bulk Operations** - Import/export transactions
- ⚪ **Transaction Templates** - Save frequently used transactions
- ⚪ **Recurring Transactions** - Automated scheduled entries

### 🏷️ Categories & Tags

- ✅ **Category Management** - Complete CRUD with real-time sync
- ✅ **Category Analytics** - Spending insights by category
- ✅ **Monthly Spending Limits** - Budget tracking per category
- 🟡 **Tag Management** - Schema ready, UI implementation pending
- ⚪ **Tag-based Filtering** - Search transactions by tags

### 📈 Dashboard & Analytics

- ✅ **Financial Overview Cards** - Balance, income, expenses, net worth
- ✅ **Recent Transactions** - Latest transactions with quick actions
- ✅ **Budget Progress Bars** - Category spending vs limits
- ✅ **Quick Actions Panel** - Fast access to common operations
- ✅ **Account Balance Overview** - All accounts with trends
- ✅ **Monthly Spending Trends** - 6-month spending patterns
- ✅ **Cash Flow Summary** - Income vs expenses with trends
- ⚪ **Advanced Reports** - Monthly/yearly analysis with charts
- ⚪ **Goal Setting & Tracking** - Financial goals with progress monitoring

### 💱 Multi-Currency

- ✅ **Currency Schema** - Database support for multiple currencies
- ✅ **Exchange Rates** - Rate storage structure
- 🟡 **Currency Conversion** - Basic conversion display
- ⚪ **Real-time Exchange Rates** - Automatic rate fetching
- ⚪ **Historical Rate Tracking** - Exchange rate history

### 🤖 Integrations & API

- ✅ **WebSocket API** - Real-time data synchronization
- 🟡 **Push Notifications** - Backend structure ready, UI pending
- ⚪ **REST API** - Public API for integrations
- ⚪ **API Documentation** - Comprehensive API documentation
- ⚪ **Telegram Bot** - Natural language transaction entry
- ⚪ **AI Transaction Entry** - LLM-powered natural language parsing

### �️ Security & Infrastructure

- ✅ **Authentication & Sessions** - Secure user authentication
- ✅ **Input Validation** - Comprehensive data validation
- ✅ **HTTPS Configuration** - SSL/TLS setup
- 🟡 **Production Deployment** - Staging and production configs
- 🟡 **Monitoring & Logging** - Grafana, Loki, Prometheus setup
- 🟡 **Automated Testing** - Unit and integration tests
- ⚪ **Security Headers** - Comprehensive security headers
- ⚪ **Rate Limiting** - API abuse prevention
- ⚪ **GDPR Compliance** - Data privacy compliance

### � User Experience

- ✅ **Mobile-First Design** - Responsive UI optimized for mobile
- ✅ **PWA Features** - App-like experience with offline capabilities
- ✅ **Real-time Updates** - Live data synchronization
- 🟡 **Dark Mode** - Theme customization with system preference
- 🟡 **Accessibility** - WCAG compliance improvements needed
- 🟡 **Search & Filters** - Basic filtering, advanced search pending
- ⚪ **Internationalization** - Multi-language support
- ⚪ **Keyboard Shortcuts** - Power user productivity features

### 🚀 Advanced Features

- ⚪ **Split Expenses** - Shared expense management
- ⚪ **Debt Tracking** - Track loans and debts
- ⚪ **Investment Tracking** - Stocks and crypto portfolio
- ⚪ **Receipt Scanning** - OCR for receipt processing
- ⚪ **Mobile Apps** - Native iOS/Android with Capacitor
- 🟡 **Enhanced Offline Mode** - Extended offline capabilities

---

**Next priorities:** API documentation, AI transaction entry, Telegram bot integration.

## Contributing

Contributions are welcome! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## Documentation

- [**Project Overview**](docs/1.principles.md) - Core principles and vision
- [**Features**](docs/2.features.md) - Detailed functionality and capabilities
- [**Architecture**](docs/3.architecture.md) - System components and interactions
- [**Technology Stack**](docs/4.tech-stack.md) - Tools and frameworks used
- [**Deployment**](docs/5.deployment.md) - Installation and setup instructions
- [**Infrastructure**](docs/6.infrastructure.md) - Deployment and hosting information

## Quick Start

Prerequisites (unix-like OS):

- [Deno](https://deno.land/): `curl -fsSL https://deno.land/install.sh | sh`
- [Docker](https://www.docker.com/): `curl -fsSL https://get.docker.com | sudo sh`

To start local development:

1. Clone the repository
2. **Install git hooks** (important for code quality):
   ```sh
   deno task hooks:install
   ```
3. Start all services:
   ```sh
   deno task compose up -d
   ```

## Development Commands

For development and code quality, use these commands:

- **`deno task check`** - Run comprehensive checks (TypeScript, linting, formatting, tests)
- **`deno task fix`** - Automatically fix linting and formatting issues
- **`deno task test`** - Run test suite only
- **`deno task ts:check`** - TypeScript check only

This will launch all necessary services & apps in Docker Compose.

## License

This project is licensed under the [MIT License](LICENSE).

---
