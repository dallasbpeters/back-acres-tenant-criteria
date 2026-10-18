"use strict";
// Loaded only by the disposable copy's Node process. Never by the deployed app.
const transport = global.fetch;
global.fetch = (input, options) => {
  if (String(input) === "https://api.resend.com/emails") {
    return transport(`${process.env.TENANT_TEST_SERVICE}/mail`, {
      ...options,
      headers: {
        authorization: `Bearer ${process.env.TENANT_TEST_CONTROL}`,
        "content-type": "application/json",
      },
    });
  }
  return transport(input, options);
};
