'use strict';

async function getWallet(_userId) {
  return { available: 0, locked: 0 };
}

module.exports = { getWallet };
