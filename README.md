# Ludo Game Backend

A Node.js + Express.js backend for a multiplayer Ludo game with Telegram integration, real-time gameplay via Socket.IO, and wallet management.

## Architecture Overview

This project follows a **clean separation of concerns** with the following structure:

### Routes (Endpoint Management Only)
- **Location**: `src/routes/`
- **Purpose**: Define API endpoints and apply middleware
- **Responsibility**: Route HTTP requests to appropriate controller methods
- **No Business Logic**: Routes only handle routing, all logic is in controllers

### Controllers (Business Logic)
- **Location**: `src/controllers/`
- **Purpose**: Contain all application business logic
- **Responsibility**: Process requests, interact with models, return responses
- **All Functionality Here**: Authentication, wallet operations, game logic, admin functions

### Key Features

✅ **Proper Separation**: Routes only define endpoints, controllers handle all functionality  
✅ **RESTful API**: Clean REST endpoints for all operations  
✅ **Real-time Gaming**: Socket.IO for live gameplay  
✅ **Wallet System**: Deposits, withdrawals, stake management  
✅ **Admin Panel**: Complete admin control and reporting  
✅ **Telegram Integration**: Authentication via Telegram Web App  
✅ **Payment Integration**: AddisPay for deposits/withdrawals  

## Project Structure

```
ludo-game-backend/
├── server.js                 # Main server file
├── package.json
├── .env.example
├── src/
│   ├── config/              # Database and Redis configuration
│   │   ├── database.js
│   │   └── redis.js
│   ├── middleware/          # Authentication, error handling
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── models/              # MongoDB schemas
│   │   ├── User.js
│   │   ├── Room.js
│   │   ├── Game.js
│   │   └── Transaction.js
│   ├── controllers/         # ALL BUSINESS LOGIC HERE
│   │   ├── authController.js
│   │   ├── walletController.js
│   │   ├── roomController.js
│   │   ├── gameController.js
│   │   └── adminController.js
│   ├── routes/              # ENDPOINT MANAGEMENT ONLY
│   │   ├── index.js
│   │   ├── authRoutes.js
│   │   ├── walletRoutes.js
│   │   ├── roomRoutes.js
│   │   ├── gameRoutes.js
│   │   └── adminRoutes.js
│   ├── socket/              # Socket.IO handlers
│   │   └── socketHandlers.js
│   ├── services/            # External service integrations
│   └── utils/               # Helper functions
│       ├── telegramAuth.js
│       └── gameLogic.js
```

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ludo-game-backend
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start MongoDB (locally or use MongoDB Atlas)
```bash
# Local MongoDB
mongod
```

5. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

## Environment Variables

See `.env.example` for all required environment variables:
- Database connection (MongoDB, Redis)
- JWT configuration
- Telegram bot token
- AddisPay API credentials
- Game configuration (commission, timeouts, etc.)

## API Endpoints

### Authentication
- `POST /api/auth/register/telegram` - Register via Telegram
- `POST /api/auth/login` - Login with phone/password
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/refresh` - Refresh JWT token

### Wallet
- `GET /api/wallet/balance` - Get wallet balance
- `GET /api/wallet/transactions` - Get transaction history
- `POST /api/wallet/deposit` - Initiate deposit
- `POST /api/wallet/withdraw` - Request withdrawal

### Rooms
- `POST /api/rooms/create` - Create new room
- `GET /api/rooms` - Get available rooms
- `GET /api/rooms/:roomId` - Get room details
- `POST /api/rooms/join` - Join a room
- `POST /api/rooms/leave` - Leave a room
- `POST /api/rooms/cancel` - Cancel a room

### Games
- `GET /api/games/my-games` - Get player's games
- `GET /api/games/:gameId` - Get game details
- `GET /api/games/room/:roomId` - Get game by room
- `POST /api/games/:gameId/abort` - Abort game (admin only)

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/:userId` - Get user details
- `PATCH /api/admin/users/:userId/status` - Update user status
- `POST /api/admin/users/:userId/wallet/adjust` - Adjust wallet
- `GET /api/admin/rooms` - Get all rooms
- `POST /api/admin/rooms/:roomId/force-end` - Force end room
- `GET /api/admin/games` - Get all games
- `GET /api/admin/transactions` - Get all transactions
- `GET /api/admin/reports/financial` - Financial reports

## Socket.IO Events

### Namespace: `/ludo`

**Client → Server:**
- `room:join` - Join a room for real-time updates
- `game:start` - Start the game
- `dice:roll` - Roll dice
- `token:move` - Move a token

**Server → Client:**
- `room:joined` - Confirmation of room join
- `player:joined` - Another player joined
- `game:started` - Game has started
- `dice:result` - Dice roll result
- `token:moved` - Token move update
- `turn:change` - Turn changed
- `game:ended` - Game ended
- `error` - Error message

## Architecture Principles

### 1. **Separation of Concerns**
```javascript
// ❌ BAD: Business logic in routes
router.post('/create-room', async (req, res) => {
  const room = new Room({ ...req.body });
  await room.save();
  // ... more logic
});

// ✅ GOOD: Routes only handle routing
router.post('/create', authenticate, roomController.createRoom);
```

### 2. **Controller Pattern**
All business logic resides in controllers:
- Input validation
- Database operations
- Business rules
- Response formatting

### 3. **Middleware Usage**
- Authentication: `authenticate` middleware
- Authorization: `isAdmin` middleware
- Error handling: Centralized error handler

### 4. **Clean Code**
- Functional programming style (no classes)
- CommonJS modules
- Clear function names
- Comprehensive error handling

## Game Flow

1. **User Registration** → Telegram or phone/password
2. **Wallet Deposit** → Via AddisPay
3. **Create/Join Room** → Select stake, mode, players
4. **Game Start** → When room is full
5. **Real-time Play** → Dice rolls, token moves via Socket.IO
6. **Game End** → Winner gets payout, losers lose stake
7. **Withdrawal** → Request withdrawal of winnings

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run in production mode
npm start
```

## Testing

```bash
# Run tests (when implemented)
npm test
```

## Deployment

This project is Docker-ready. See `game.md` for deployment specifications.

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB (with Mongoose ODM)
- **Cache**: Redis (optional)
- **Real-time**: Socket.IO
- **Authentication**: JWT + Telegram Web App
- **Payment**: AddisPay API
- **Currency**: Ethiopian Birr (ETB)

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]
