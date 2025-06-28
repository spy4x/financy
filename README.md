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

**Legend:**

- ✅ **Completed** - Feature is fully implemented and functional
- 🟡 **In Progress** - Feature is partially implemented, needs improvements, or being worked on
- ⚪ **Not Started** - Feature has not been implemented yet

**Progress Overview:**

- 📊 **Overall Progress:** 53% (40 completed + 20 in progress / 102 total features)
- 🏗️ **Basic Features:** 78% (Core infrastructure, user management, financial features)
- 🚀 **Advanced Features:** 13% (Dashboard analytics, real-time features, multi-currency)

### 🏗️ Core Infrastructure

- ✅ **Database Schema** - Complete PostgreSQL schema with all tables
- ✅ **CQRS Architecture** - Command/Event pattern with buses
- 🟡 **Authentication System** - User auth with basic login/signup (2FA in progress)
- ✅ **Real-time Communication** - WebSocket implementation
- ✅ **Caching Layer** - Valkey/Redis for performance
- ✅ **Containerization** - Docker setup for all services
- ✅ **PWA Foundation** - Progressive Web App capabilities

### 👥 User Management

- 🟡 **User Registration/Login** - Basic auth flow implemented (needs profile management)
- ✅ **Session Management** - Secure session handling
- 🟡 **Role-Based Access Control** - Multi-tier permissions (partially implemented)
- 🟡 **Two-Factor Authentication** - TOTP backend ready (UI needs completion)
- 🟡 **Password Management** - Basic change functionality (reset needs work)
- ⚪ **User Profile Management** - Profile editing, preferences
- ⚪ **Account Recovery** - Email-based recovery system

### 🏢 Group Collaboration

- 🟡 **Group Management** - Create, edit, list groups (delete needs work)
- 🟡 **Delete dependencies** - Soft-delete group members and data (in progress)
- ✅ **Group Settings** - Default currencies, preferences
- ✅ **Real-time Updates** - Live sync across group members
- 🟡 **Group Membership** - Role-based access partially implemented
- ⚪ **Member Invitations** - Invite users via email/link
- ⚪ **Member Management** - Add/remove group members
- ⚪ **Group Access Sharing** - Share group access between users with granular permissions
- ⚪ **Group Analytics** - Usage statistics and insights

### 🏦 Account Management

- ✅ **Database Schema** - Account table structure
- ✅ **Backend API** - Account CRUD operations
- ✅ **Account Creation** - UI for adding new accounts (complete)
- ✅ **Account Management** - Edit account details, currencies (complete UI)
- ✅ **Account List** - View all accounts with balances
- 🟡 **Multi-Currency Support** - Display in different currencies (partial)
- ✅ **Account Archiving** - Soft delete unused accounts (complete with undelete)
- ⚪ **Cross-Group Account Sharing** - Share accounts between multiple groups

### 📊 Transaction Management

- ✅ **Database Schema** - Transaction table with full structure
- ✅ **Backend API** - Transaction CRUD via WebSockets
- ✅ **Multi-Currency Support** - Original + converted amounts
- ✅ **Transaction Creation** - Add income/expense forms (complete)
- ✅ **Transaction List** - View/filter transaction history (complete)
- ✅ **Transaction Editing** - Modify existing transactions (complete UI)
- ✅ **Transaction Archiving** - Soft delete with undelete functionality
- ⚪ **Bulk Operations** - Import/export transactions
- ⚪ **Transaction Templates** - Save frequently used transactions
- ⚪ **Recurring Transactions** - Automated scheduled entries
- ⚪ **AI-based entry and categorization** - Tell a bot to add transactions - let it figure out the rest (group, account, category, tags, etc.)
- ⚪ **Free-form Transaction Input** - LLM-powered natural language transaction entry with automatic parsing

### 🏷️ Organization Features

- ✅ **Categories** - Complete category management system
- ✅ **Category CRUD** - Create, edit, delete categories
- ✅ **Real-time Sync** - Live category updates
- ✅ **Tags Schema** - Database structure for tags
- 🟡 **Tag Management** - Create and assign tags to transactions (schema ready)
- ⚪ **Tag-based Filtering** - Search transactions by tags
- ⚪ **Smart Categorization** - Auto-suggest categories
- ⚪ **Category Analytics** - Spending by category insights

### 📈 Reporting & Analytics

#### Dashboard Features

- ✅ **Financial Overview Cards** - Key metrics: total balance, monthly income/expenses, net worth
- ✅ **Recent Transactions List** - Latest 10 transactions with quick actions
- ✅ **Budget Progress Bars** - Category spending vs monthly limits (complete implementation)
- ✅ **Quick Actions Panel** - Fast access to add transactions, accounts, categories
- ✅ **Account Balances Overview** - All account balances with trends and health indicators
- ✅ **Monthly Spending Trends** - 6-month spending patterns and comparisons
- ✅ **Cash Flow Summary** - Current month income vs expenses with trend indicators

#### Advanced Analytics

- ✅ **Category Spending Breakdown** - Detailed spending analysis by category
- ✅ **Exchange Rate Widget** - Current rates for multi-currency setups
- ⚪ **Goal Tracking** - Savings goals and progress tracking (future enhancement)
- ⚪ **Spending Reports** - Monthly/yearly expense analysis
- ⚪ **Income Analysis** - Revenue tracking and trends
- ⚪ **Group Reports** - Shared financial insights
- ⚪ **Visual Charts** - Pie charts, bar graphs, trends
- ⚪ **Export Reports** - PDF/CSV report generation
- ⚪ **Custom Date Ranges** - Flexible reporting periods

### 💱 Currency & Exchange

- ✅ **Multi-Currency Schema** - Database support for currencies
- ✅ **Exchange Rates Table** - Rate storage structure
- ⚪ **Currency Conversion** - Real-time exchange rates
- ⚪ **Rate Updates** - Automatic rate fetching
- ⚪ **Historical Rates** - Track exchange rate changes
- 🟡 **Currency Preferences** - User/group default currencies (basic implementation)
- 🟡 **Conversion Display** - Show amounts in preferred currency (partial)
- 🟡 **Proper Multi-Currency Support** - Complete multi-currency functionality (currently early stage)

### 🤖 Integrations & API

- ✅ **WebSocket API** - Real-time data sync
- 🟡 **Push Notifications** - Web push notification system (backend structure ready)
- ⚪ **REST API** - Public API for integrations
- ⚪ **API Authentication** - Token-based API access
- ⚪ **API Documentation** - Comprehensive API docs
- ⚪ **Telegram Bot** - Natural language transaction entry
- ⚪ **Webhook Support** - External service integrations
- ⚪ **Zapier Integration** - Automation platform support

### 💾 Data Management

- ✅ **Database Migrations** - Version-controlled schema changes
- ✅ **Data Validation** - Type-safe validation with Arktype
- ✅ **Soft Deletes** - Recoverable data deletion
- ⚪ **Data Export** - Backup user data (JSON/SQL)
- ⚪ **Data Import** - Restore from backups
- ⚪ **Data Archiving** - Archive old transactions
- 🟡 **Data Cleanup** - Remove expired sessions/data (partial implementation)

### 🏛️ Infrastructure & DevOps

- ✅ **Docker Compose** - Development environment
- ✅ **Code Quality** - Linting, formatting, TypeScript checks
- ✅ **Git Hooks** - Pre-commit quality checks
- 🟡 **Production Deployment** - Staging and production configs (needs refinement)
- 🟡 **Monitoring Stack** - Grafana, Loki, Prometheus setup (configs ready)
- 🟡 **Automated Testing** - Unit and integration tests (basic tests exist)
- ⚪ **CI/CD Pipeline** - Automated deployment
- 🟡 **Database Backups** - Automated backup strategy (scripts exist)
- ⚪ **Security Scanning** - Vulnerability assessments

### 🔒 Security & Compliance

- ✅ **Authentication** - Secure user authentication
- ✅ **Session Security** - Secure session management
- ✅ **Input Validation** - Comprehensive data validation
- ✅ **HTTPS Ready** - SSL/TLS configuration
- ⚪ **Security Headers** - Comprehensive security headers
- ⚪ **Rate Limiting** - API abuse prevention
- 🟡 **Audit Logging** - Security event logging (basic implementation)
- ⚪ **GDPR Compliance** - Data privacy compliance
- ⚪ **Security Testing** - Penetration testing

### 🚀 Advanced Features

- ⚪ **Split Expenses** - Shared expense management
- ⚪ **Debt Tracking** - Track loans and debts
- ⚪ **Investment Tracking** - Stocks, crypto portfolio
- ⚪ **Budget Planning** - Set and track budgets
- ⚪ **Goal Setting** - Savings goals and progress
- ⚪ **Receipt Scanning** - OCR for receipt processing
- ⚪ **Mobile Apps** - Native iOS/Android with Capacitor
- 🟡 **Offline Mode** - Extended offline capabilities (PWA cache ready)

### 📱 User Experience

- ✅ **Mobile-First Design** - Responsive UI for mobile
- ✅ **PWA Features** - App-like experience
- ✅ **Real-time Updates** - Live data synchronization
- 🟡 **Dark Mode** - Theme customization with system preference support
- 🟡 **Accessibility** - WCAG compliance (needs improvement)
- ⚪ **Internationalization** - Multi-language support
- ⚪ **Keyboard Shortcuts** - Power user features
- 🟡 **Search & Filters** - Advanced search capabilities (basic filtering implemented)

---

**Current Focus:** Core functionality is complete! Next priorities: API documentation, bulk operations, AI-powered transaction entry, and advanced integrations (Telegram bot, mobile apps).

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
