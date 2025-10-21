'use strict';

async function createInvoice(_userId, _amount) {
  return { invoiceId: 'inv_' + Date.now(), status: 'pending' };
}

module.exports = { createInvoice };
