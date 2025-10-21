# Architecture: Routes vs Controllers

This document explains the clean separation between routes and controllers in this project.

## Core Principle

**Routes handle ONLY endpoint management. Controllers contain ALL business logic.**

## Routes Responsibility

Routes files (`routes/*.js`) should ONLY:
1. ✅ Define endpoint paths
2. ✅ Apply middleware (authentication, validation)
3. ✅ Call controller methods
4. ✅ Map HTTP methods to functions

Routes should NOT:
1. ❌ Contain business logic
2. ❌ Interact with databases
3. ❌ Process data
4. ❌ Implement algorithms
5. ❌ Handle errors (beyond passing to error handler)

## Controllers Responsibility

Controller files (`controllers/*.js`) should:
1. ✅ Implement ALL business logic
2. ✅ Validate input data
3. ✅ Interact with database models
4. ✅ Process and transform data
5. ✅ Implement business rules
6. ✅ Format responses
7. ✅ Handle errors

## Examples

### Authentication Routes (`routes/authRoutes.js`)

```javascript
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// ONLY endpoint definitions - NO business logic
router.post('/register/telegram', authController.registerWithTelegram);
router.post('/login', authController.loginWithPassword);
router.get('/profile', authenticate, authController.getProfile);
router.post('/refresh', authenticate, authController.refreshToken);

module.exports = router;
```

**What's happening:**
- Route defines 4 endpoints
- Applies `authenticate` middleware where needed
- Delegates to controller methods
- **Zero business logic**

### Authentication Controller (`src/controllers/authController.js`)

```javascript
const registerWithTelegram = async (req, res, next) => {
  try {
    const { initData, password } = req.body;

    // Validation
    if (!initData) {
      return res.status(400).json({
        success: false,
        message: 'Telegram initData is required'
      });
    }

    // Business logic: Verify Telegram data
    const isValid = verifyTelegramData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Telegram data'
      });
    }

    // Business logic: Parse user data
    const telegramUser = parseTelegramUser(initData);
    
    // Database interaction: Check existing user
    let user = await User.findOne({ 
      $or: [
        { telegramId: telegramUser.id.toString() },
        { phone: telegramUser.phone_number }
      ]
    });

    if (user) {
      // Business logic: Generate JWT
      const token = jwt.sign({ ...userData }, secret, { expiresIn });
      return res.status(200).json({ success: true, token, user });
    }

    // Business logic: Create new user
    user = new User({ ...userData });
    await user.save();

    // Response formatting
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: { ...formattedUser }
    });
  } catch (error) {
    next(error);
  }
};
```

**What's happening:**
- ALL validation logic
- ALL business rules
- ALL database operations
- ALL data processing
- Error handling
- Response formatting

## File Structure Comparison

### Routes Directory
```
src/routes/
├── index.js           # Main router aggregator
├── authRoutes.js      # Auth endpoints only
├── walletRoutes.js    # Wallet endpoints only
├── roomRoutes.js      # Room endpoints only
├── gameRoutes.js      # Game endpoints only
└── adminRoutes.js     # Admin endpoints only
```

**Each file is ~10-20 lines** because they only define endpoints.

### Controllers Directory
```
src/controllers/
├── authController.js      # Auth business logic (200+ lines)
├── walletController.js    # Wallet business logic (300+ lines)
├── roomController.js      # Room business logic (250+ lines)
├── gameController.js      # Game business logic (250+ lines)
└── adminController.js     # Admin business logic (300+ lines)
```

**Each file is 200-300+ lines** because they contain all the logic.

## Benefits of This Architecture

### 1. **Clarity**
- Clear separation of concerns
- Easy to understand what each file does
- Routes are just a table of contents

### 2. **Maintainability**
- Business logic changes don't affect routing
- Easy to find where logic lives
- Single responsibility principle

### 3. **Testability**
- Controllers can be unit tested independently
- Routes are simple and need minimal testing
- Mock data easily in controller tests

### 4. **Scalability**
- Easy to add new endpoints (just add route)
- Easy to modify logic (just edit controller)
- Controllers can be broken into services if needed

### 5. **Reusability**
- Controller methods can be called from multiple places
- Socket handlers can reuse controller logic
- Internal functions can call controllers

## Socket.IO Follows Same Pattern

Even Socket.IO handlers follow this pattern:

```javascript
// Socket handler (socket/socketHandlers.js)
socket.on('dice:roll', async (data) => {
  try {
    const { gameId } = data;

    // Call controller method - NO logic here
    const result = await handleDiceRoll(gameId, socket.user.userId);

    // Just emit the result
    ludoNamespace.to(room.roomId).emit('dice:result', result);
  } catch (error) {
    socket.emit('error', { message: error.message });
  }
});
```

```javascript
// Controller method (controllers/gameController.js)
const handleDiceRoll = async (gameId, userId) => {
  // ALL the business logic here
  const game = await Game.findOne({ gameId });
  // Validate turn
  // Roll dice
  // Update game state
  // Return result
};
```

## Code Review Checklist

When adding new features, ask:

**In Routes:**
- [ ] Does this file only define endpoints?
- [ ] Is there any business logic? (There shouldn't be!)
- [ ] Are we only calling controller methods?
- [ ] Is middleware properly applied?

**In Controllers:**
- [ ] Does this contain all the business logic?
- [ ] Are all validations here?
- [ ] Are database operations here?
- [ ] Is error handling comprehensive?
- [ ] Are responses properly formatted?

## Anti-Patterns to Avoid

### ❌ DON'T: Put logic in routes
```javascript
// BAD - Logic in routes
router.post('/create-room', authenticate, async (req, res) => {
  const room = new Room({
    roomId: uuidv4(),
    stakeValue: req.body.stakeValue,
    // ... more logic
  });
  await room.save();
  res.json({ room });
});
```

### ✅ DO: Keep routes clean
```javascript
// GOOD - Only routing
router.post('/create', authenticate, roomController.createRoom);
```

### ❌ DON'T: Handle responses in multiple places
```javascript
// BAD - Some logic in route, some in controller
router.post('/login', async (req, res) => {
  const user = await authController.findUser(req.body.phone);
  if (!user) {
    return res.status(404).json({ error: 'Not found' });
  }
  // ...
});
```

### ✅ DO: Let controllers handle everything
```javascript
// GOOD - Controller handles all logic and responses
router.post('/login', authController.loginWithPassword);
```

## Summary

| Aspect | Routes | Controllers |
|--------|--------|-------------|
| **Purpose** | Define endpoints | Implement logic |
| **Length** | 10-20 lines | 200-300+ lines |
| **Contains** | Endpoint paths, middleware | All business logic |
| **Imports** | Controllers, middleware | Models, utilities, services |
| **Tests** | Minimal | Comprehensive |
| **Changes** | Rare | Frequent |

This architecture ensures maintainable, scalable, and professional code organization.
