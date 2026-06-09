let authResponse = null;

window.primer.setup().then(onLoad);

function renderPayPalButton() {
  const button = document.getElementById('paypal-button');

  const options = {
    createOrder: function (data, actions) {
      return actions.order.create({
        intent: 'AUTHORIZE',
        purchase_units: [
          {
            amount: {
              currency_code: 'EUR',
              value: '12.99',
            },
          },
        ],
      });
    },

    onApprove: function (data) {
      return onAuthorizeTransaction(data.orderID);
    },
  };

  window.paypal.Buttons(options).render(button);
}

async function onLoad() {
  renderPayPalButton();

  document
    .getElementById('cancel-button')
    .addEventListener('click', onCancelTransaction);
}

function onAuthorizeTransaction(orderId) {
  fetch('/api/authorize', {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
    .then((r) => r.json())
    .then((response) => {
      authResponse = response;
      document.getElementById('cancel-button').removeAttribute('disabled');
    });
}

function onCancelTransaction() {
  fetch('/api/cancel', {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: authResponse.processorTransactionId }),
  });
}