# Ludo Game Backend - Complete Project Structure

## Overview
This is a properly architected Node.js/Express.js backend with **clean separation between routes and controllers**.

## Directory Structure

```
ludo-game-backend/
│
├── server.js                          # Main server entry point
├── package.json                       # Dependencies and scripts
├── .env.example                       # Environment variables template
├── .gitignore                         # Git ignore rules
│
├── README.md                          # Project documentation
├── ARCHITECTURE.md                    # Architecture explanation
├── PROJECT_STRUCTURE.md              # This file
├── game.md                           # Game specifications
│
└── src/                              # Source code directory
    │
    ├── config/                       # Configuration files
    │   ├── database.js              # MongoDB connection
    │   └── redis.js                 # Redis connection (optional)
    │
    ├── middleware/                   # Express middleware
    │   ├── auth.js                  # Authentication & authorization
    │   └── errorHandler.js          # Centralized error handling
    │
    ├── models/                       # MongoDB/Mongoose models
    │   ├── User.js                  # User schema
    │   ├── Room.js                  # Room/session schema
    │   ├── Game.js                  # Game state schema
    │   └── Transaction.js           # Wallet transaction schema
    │
    ├── controllers/                  # ⭐ ALL BUSINESS LOGIC HERE
    │   ├── authController.js        # Authentication logic
    │   ├── walletController.js      # Wallet operations logic
    │   ├── roomController.js        # Room management logic
    │   ├── gameController.js        # Game logic
    │   └── adminController.js       # Admin operations logic
    │
    ├── routes/                       # ⭐ ENDPOINT MANAGEMENT ONLY
    │   ├── index.js                 # Main router (aggregates all routes)
    │   ├── authRoutes.js            # Auth endpoints
    │   ├── walletRoutes.js          # Wallet endpoints
    │   ├── roomRoutes.js            # Room endpoints
    │   ├── gameRoutes.js            # Game endpoints
    │   └── adminRoutes.js           # Admin endpoints
    │
    ├── socket/                       # Socket.IO handlers
    │   └── socketHandlers.js        # Real-time game events
    │
    ├── services/                     # External services (future)
    │   └── (payment, notifications, etc.)
    │
    └── utils/                        # Helper utilities
        ├── telegramAuth.js          # Telegram authentication helpers
        └── gameLogic.js             # Game rules and calculations
```

## Key Principles

### 1. Routes = Endpoint Management ONLY
**Location**: `src/routes/`

**Purpose**: Define API endpoints and apply middleware

**Example**: `src/routes/authRoutes.js`
```javascript
router.post('/register/telegram', authController.registerWithTelegram);
router.post('/login', authController.loginWithPassword);
router.get('/profile', authenticate, authController.getProfile);
```

**Lines of code**: 10-20 lines per file

### 2. Controllers = ALL Business Logic
**Location**: `src/controllers/`

**Purpose**: Implement ALL application functionality

**Contains**:
- Input validation
- Database operations
- Business rules
- Data processing
- Response formatting
- Error handling

**Example**: `src/controllers/authController.js`
```javascript
const registerWithTelegram = async (req, res, next) => {
  try {
    // Validation
    if (!initData) {
      return res.status(400).json({ ... });
    }

    // Business logic: Verify Telegram
    const isValid = verifyTelegramData(...);
    
    // Database operations
    let user = await User.findOne({ ... });
    
    // More business logic
    const token = jwt.sign({ ... });
    
    // Response
    res.status(201).json({ ... });
  } catch (error) {
    next(error);
  }
};
```

**Lines of code**: 200-300+ lines per file

## File Count Summary

| Category | Count | Purpose |
|----------|-------|---------|
| **Routes** | 6 files | Endpoint definitions only |
| **Controllers** | 5 files | All business logic |
| **Models** | 4 files | Database schemas |
| **Middleware** | 2 files | Auth & error handling |
| **Utils** | 2 files | Helper functions |
| **Config** | 2 files | Database & Redis setup |
| **Socket** | 1 file | Real-time handlers |
| **Root** | 1 file | Server entry point |

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register/telegram` - Register with Telegram
- `POST /login` - Login with phone/password
- `GET /profile` - Get user profile
- `POST /refresh` - Refresh JWT token

### Wallet (`/api/wallet`)
- `GET /balance` - Get wallet balance
- `GET /transactions` - Transaction history
- `POST /deposit` - Initiate deposit
- `POST /withdraw` - Request withdrawal

### Rooms (`/api/rooms`)
- `POST /create` - Create new room
- `GET /` - List available rooms
- `GET /:roomId` - Get room details
- `POST /join` - Join a room
- `POST /leave` - Leave a room
- `POST /cancel` - Cancel a room

### Games (`/api/games`)
- `GET /my-games` - Get player's games
- `GET /:gameId` - Get game details
- `GET /room/:roomId` - Get game by room ID
- `POST /:gameId/abort` - Abort game (admin)

### Admin (`/api/admin`)
- `GET /stats` - Dashboard statistics
- `GET /users` - List all users
- `GET /users/:userId` - User details
- `PATCH /users/:userId/status` - Update user status
- `POST /users/:userId/wallet/adjust` - Adjust wallet
- `GET /rooms` - List all rooms
- `POST /rooms/:roomId/force-end` - Force end room
- `GET /games` - List all games
- `GET /transactions` - List all transactions
- `GET /reports/financial` - Financial reports

## Socket.IO Events

**Namespace**: `/ludo`

**Client → Server**:
- `room:join` - Join room for updates
- `game:start` - Start the game
- `dice:roll` - Roll dice
- `token:move` - Move a token

**Server → Client**:
- `room:joined` - Room join confirmation
- `player:joined` - Player joined notification
- `game:started` - Game started
- `dice:result` - Dice roll result
- `token:moved` - Token move update
- `turn:change` - Turn changed
- `game:ended` - Game ended
- `error` - Error message

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Cache**: Redis (optional)
- **Real-time**: Socket.IO
- **Auth**: JWT + Telegram Web App
- **Payment**: AddisPay API
- **Style**: Functional (no classes), CommonJS

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start MongoDB**
   ```bash
   mongod
   ```

4. **Run server**
   ```bash
   # Development with auto-reload
   npm run dev

   # Production
   npm start
   ```

5. **Test the API**
   ```bash
   curl http://localhost:3000/api/health
   ```

## Architecture Benefits

✅ **Clean Separation**: Routes vs Controllers clearly separated  
✅ **Maintainable**: Easy to find and modify code  
✅ **Testable**: Controllers can be unit tested independently  
✅ **Scalable**: Easy to add new features  
✅ **Professional**: Industry-standard architecture  
✅ **Reusable**: Controllers can be called from anywhere  

## Next Steps

1. Set up environment variables in `.env`
2. Install dependencies with `npm install`
3. Start MongoDB and Redis (optional)
4. Run the server with `npm run dev`
5. Test endpoints with Postman or curl
6. Implement frontend integration
7. Add comprehensive tests
8. Deploy to production

## Important Notes

⚠️ **Routes should NEVER contain business logic**  
⚠️ **All logic must be in controllers**  
⚠️ **Controllers handle everything except routing**  
⚠️ **Socket handlers also call controllers for logic**  

This ensures clean, maintainable, and professional code architecture.
