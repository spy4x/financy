# Financy

Open-source, self-hostable finance tracking for individuals, families, and small
businesses.

Financy is an **open-source** and **self-hostable** double-entry financial
management web application focused on personal, family, and business expense
management. It emphasizes rich capabilities, transparency, and ease of use while
offering advanced features like group collaboration, public API integrations,
and Telegram bot integration.

## 🗺️ Development Roadmap

### 🏗️ Core Infrastructure

- [x] **Database Schema** - Complete PostgreSQL schema with all tables
- [x] **CQRS Architecture** - Command/Event pattern with buses
- [x] **Authentication System** - User auth with 2FA/TOTP support
- [x] **Real-time Communication** - WebSocket implementation
- [x] **Caching Layer** - Valkey/Redis for performance
- [x] **Containerization** - Docker setup for all services
- [x] **PWA Foundation** - Progressive Web App capabilities

### 👥 User Management

- [x] **User Registration/Login** - Complete auth flow
- [x] **Session Management** - Secure session handling
- [x] **Role-Based Access Control** - Multi-tier permissions
- [ ] **Two-Factor Authentication** - TOTP implementation
- [ ] **Password Management** - Change/reset functionality
- [ ] **User Profile Management** - Profile editing, preferences
- [ ] **Account Recovery** - Email-based recovery system

### 🏢 Group Collaboration

- [x] **Group Management** - Create, edit, delete groups
- [ ] **Delete dependencies** - Soft-delete group members and data
- [x] **Group Settings** - Default currencies, preferences
- [x] **Real-time Updates** - Live sync across group members
- [ ] **Group Membership** - Role-based access (Viewer, Editor, Admin, Owner)
- [ ] **Member Invitations** - Invite users via email/link
- [ ] **Member Management** - Add/remove group members
- [ ] **Group Analytics** - Usage statistics and insights

### 🏦 Account Management

- [x] **Database Schema** - Account table structure
- [x] **Backend API** - Account CRUD operations
- [ ] **Account Creation** - UI for adding new accounts
- [ ] **Account Management** - Edit account details, currencies
- [ ] **Account List** - View all accounts with balances
- [ ] **Multi-Currency Support** - Display in different currencies
- [ ] **Account Archiving** - Soft delete unused accounts

### 📊 Transaction Management

- [x] **Database Schema** - Transaction table with full structure
- [x] **Backend API** - Transaction CRUD via WebSockets
- [x] **Multi-Currency Support** - Original + converted amounts
- [ ] **Transaction Creation** - Add income/expense forms
- [ ] **Transaction List** - View/filter transaction history
- [ ] **Transaction Editing** - Modify existing transactions
- [ ] **Bulk Operations** - Import/export transactions
- [ ] **Transaction Templates** - Save frequently used transactions
- [ ] **Recurring Transactions** - Automated scheduled entries
- [ ] **AI-based entry and categorization** - Tell a bot to add transactions - let it figure out the rest (group, account, category, tags, etc.)

### 🏷️ Organization Features

- [x] **Categories** - Complete category management system
- [x] **Category CRUD** - Create, edit, delete categories
- [x] **Real-time Sync** - Live category updates
- [x] **Tags Schema** - Database structure for tags
- [ ] **Tag Management** - Create and assign tags to transactions
- [ ] **Tag-based Filtering** - Search transactions by tags
- [ ] **Smart Categorization** - Auto-suggest categories
- [ ] **Category Analytics** - Spending by category insights

### 📈 Reporting & Analytics

- [ ] **Dashboard** - Financial overview and key metrics
- [ ] **Spending Reports** - Monthly/yearly expense analysis
- [ ] **Income Analysis** - Revenue tracking and trends
- [ ] **Cash Flow Reports** - Inflows vs outflows
- [ ] **Category Reports** - Breakdown by categories/tags
- [ ] **Group Reports** - Shared financial insights
- [ ] **Visual Charts** - Pie charts, bar graphs, trends
- [ ] **Export Reports** - PDF/CSV report generation
- [ ] **Custom Date Ranges** - Flexible reporting periods

### 💱 Currency & Exchange

- [x] **Multi-Currency Schema** - Database support for currencies
- [x] **Exchange Rates Table** - Rate storage structure
- [ ] **Currency Conversion** - Real-time exchange rates
- [ ] **Rate Updates** - Automatic rate fetching
- [ ] **Historical Rates** - Track exchange rate changes
- [ ] **Currency Preferences** - User/group default currencies
- [ ] **Conversion Display** - Show amounts in preferred currency

### 🤖 Integrations & API

- [x] **WebSocket API** - Real-time data sync
- [x] **CQRS WebSocket Handlers** - Modular message handling system
- [x] **Type-safe RPC** - Shared commands/queries/events between API and Web
- [ ] **WebSocket Rate Limiting** - Prevent abuse of real-time connections
- [ ] **WebSocket Message Size Limits** - Protect against large message attacks
- [ ] **Push Notifications** - Web push notification system
- [ ] **REST API** - Public API for integrations
- [ ] **API Authentication** - Token-based API access
- [ ] **API Documentation** - Comprehensive API docs
- [ ] **Telegram Bot** - Natural language transaction entry
- [ ] **Webhook Support** - External service integrations
- [ ] **Zapier Integration** - Automation platform support

### 💾 Data Management

- [x] **Database Migrations** - Version-controlled schema changes
- [x] **Data Validation** - Type-safe validation with Arktype
- [x] **Soft Deletes** - Recoverable data deletion
- [ ] **Data Export** - Backup user data (JSON/SQL)
- [ ] **Data Import** - Restore from backups
- [ ] **Data Archiving** - Archive old transactions
- [ ] **Data Cleanup** - Remove expired sessions/data

### 🏛️ Infrastructure & DevOps

- [x] **Docker Compose** - Development environment
- [x] **Code Quality** - Linting, formatting, TypeScript checks
- [x] **Git Hooks** - Pre-commit quality checks
- [ ] **Production Deployment** - Staging and production configs
- [ ] **Monitoring Stack** - Grafana, Loki, Prometheus setup
- [ ] **Automated Testing** - Unit and integration tests
- [ ] **CI/CD Pipeline** - Automated deployment
- [ ] **Database Backups** - Automated backup strategy
- [ ] **Security Scanning** - Vulnerability assessments

### 🔒 Security & Compliance

- [x] **Authentication** - Secure user authentication
- [x] **Session Security** - Secure session management
- [x] **Input Validation** - Comprehensive data validation
- [x] **HTTPS Ready** - SSL/TLS configuration
- [ ] **Security Headers** - Comprehensive security headers
- [ ] **Rate Limiting** - API abuse prevention
- [ ] **Audit Logging** - Security event logging
- [ ] **GDPR Compliance** - Data privacy compliance
- [ ] **Security Testing** - Penetration testing

### 🚀 Advanced Features

- [ ] **Split Expenses** - Shared expense management
- [ ] **Debt Tracking** - Track loans and debts
- [ ] **Investment Tracking** - Stocks, crypto portfolio
- [ ] **Budget Planning** - Set and track budgets
- [ ] **Goal Setting** - Savings goals and progress
- [ ] **Receipt Scanning** - OCR for receipt processing
- [ ] **Mobile Apps** - Native iOS/Android with Capacitor
- [ ] **Offline Mode** - Extended offline capabilities

### 📱 User Experience

- [x] **Mobile-First Design** - Responsive UI for mobile
- [x] **PWA Features** - App-like experience
- [x] **Real-time Updates** - Live data synchronization
- [ ] **Dark Mode** - Theme customization
- [ ] **Accessibility** - WCAG compliance
- [ ] **Internationalization** - Multi-language support
- [ ] **Keyboard Shortcuts** - Power user features
- [ ] **Search & Filters** - Advanced search capabilities

---

**Current Focus:** Transaction Management, Account Management, and basic reporting dashboard.

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
