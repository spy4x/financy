# Financy Telegram Bot

The Financy Telegram Bot provides a convenient way to interact with your financial data directly from Telegram. The bot is integrated into the main API service and supports account management, transaction creation, and quick financial overviews.

## Features

- 🔐 **Secure Authentication**: Uses Telegram's built-in authentication system
- 💰 **Account Balances**: View all your accounts and their current balances
- 📋 **Categories**: List your expense and income categories
- 📊 **Recent Transactions**: View your last 10 transactions
- ➕ **Add Transactions**: Create new transactions through guided conversation

## Getting Started

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the instructions
3. Save the bot token provided by BotFather
4. Add the bot token to your environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

### 2. Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Telegram Bot Configuration (integrated into API)
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_FROM_BOTFATHER
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=your_random_webhook_secret
```

### 3. Deploy the Bot

The bot is integrated into the main API service and runs automatically:

```bash
# Start all services including the bot
deno task dev
```

### 4. Set Up Webhook (Production)

For production deployment, configure the webhook URL to point to your domain:

```bash
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
```

## Bot Commands

### Authentication
- `/start` - Create account or sign in

### Account Management
- `/accounts` - View all accounts and balances
- `/categories` - View all categories

### Transactions
- `/recent` - Show last 10 transactions
- `/add` - Add a new transaction (guided flow)

### General
- `/help` - Show available commands
- `/cancel` - Cancel current operation

## Usage Flow

### First Time Setup
1. Start a chat with your bot
2. Send `/start` to create your account
3. The bot will create a Financy user account linked to your Telegram ID

### Adding Transactions
1. Send `/add` to start the transaction flow
2. Choose transaction type (expense/income)
3. Select account
4. Select category
5. Enter amount
6. Add optional memo
7. Confirm creation

### Viewing Data
- Use `/accounts` to see current balances
- Use `/recent` to see recent transaction history
- Use `/categories` to see available categories

## Security

- **Authentication**: Uses Telegram user IDs for secure authentication
- **Multi-tenancy**: All data is properly scoped to users and groups
- **Permissions**: Respects existing group membership permissions
- **Webhook Security**: Optional webhook secret for production deployments

## Development

### Testing

The bot uses polling mode for development (no webhook required). Simply set your bot token and the API service will automatically start the Telegram bot functionality.

### Architecture

- **Integration**: Telegram bot functionality is integrated into the main API service
- **Shared Libraries**: Reuses business logic from `libs/shared/`
- **Database**: Uses the same PostgreSQL database as the main application
- **Authentication**: Creates user_keys entries with `kind = 4` (TELEGRAM_AUTH)

## Troubleshooting

### Bot Not Responding
1. Check that `TELEGRAM_BOT_TOKEN` is correctly set
2. Verify the API service is running (`docker logs <project>-api`)
3. Ensure database migrations have been applied

### Webhook Issues
1. Verify `TELEGRAM_WEBHOOK_URL` is accessible from the internet
2. Check `TELEGRAM_WEBHOOK_SECRET` matches between bot and Telegram
3. Use `/api/telegram/info` endpoint to debug webhook status

### Database Errors
1. Ensure the Telegram auth migration has been applied:
   ```sql
   -- Check if migration exists
   SELECT * FROM migrations WHERE name LIKE '%telegram%';
   ```
2. Verify user_keys table supports `kind = 4`

## API Endpoints

- `GET /api/telegram/info` - Bot status and health check
- `POST /api/telegram/webhook` - Telegram webhook receiver

## Limitations

- No support for transfers between accounts (use web app)
- Cannot create new accounts or categories (use web app)
- Limited to 10 recent transactions
- No support for transaction editing or deletion
- Single currency display per account

## Future Enhancements

- [ ] Transaction search and filtering
- [ ] Budget tracking and alerts
- [ ] Account transfer support
- [ ] Inline keyboards for better UX
- [ ] Multi-language support
- [ ] Rich transaction formatting
- [ ] Photo receipt support
- [ ] Recurring transaction reminders
