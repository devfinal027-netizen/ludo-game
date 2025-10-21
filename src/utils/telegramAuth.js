const crypto = require('crypto');

const verifyTelegramData = (initData, botToken) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto
      .createHash('sha256')
      .update(botToken)
      .digest();
    
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return hash === calculatedHash;
  } catch (error) {
    console.error('Telegram data verification error:', error);
    return false;
  }
};

const parseTelegramUser = (initData) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    
    if (!userParam) {
      return null;
    }
    
    return JSON.parse(userParam);
  } catch (error) {
    console.error('Error parsing Telegram user:', error);
    return null;
  }
};

module.exports = { verifyTelegramData, parseTelegramUser };
