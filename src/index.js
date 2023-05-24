const Stripe = require("stripe");
const currency = require("currency.js");
const { Buffer } = require("buffer");

async function handleRequest(request, env) {
  const { headers } = request;
  const userAgent = headers.get("user-agent") || "";
  const contentType = headers.get("content-type") || "";

  // Bail if user agent is incorrect
  if (userAgent != env.GOOD_USER_AGENT) {
    console.error(`${userAgent} is not ${env.GOOD_USER_AGENT}`);
    return new Response("Bad Request: Incorrect user agent", { status: 400 });
  }

  if (request.method === "POST" && contentType.includes("application/json")) {
    try {
      // Extract the POST body
      const body = await request.json();
      //check type for "order_created" or "package_shipped"
      if (body.type && body.type == "order_created") {
        //handle order created here
        console.log("order created");

        const mailjetResponse = await handleOrderCreated(body, env);
        // console.log(
        //   "It's ya mailjet Response: ",
        //   JSON.stringify(mailjetResponse, null, 2)
        // );
        return new Response("it's ya boi: webhook 'order_created' successful");
      } else if (body.type && body.type == "package_shipped") {
        //handle package shipped here
        console.log("package shipped");

        // We don't know exactly what the shape of the data will look like
        // for real orders so until we have a better way to do this, we'll
        // sent a copy of it as a JSON string to the admin email for future
        // investigation.
        await sendToAdminForPackageShipped(body, env);

        // But we know enough about the webhook payload to know it should
        // contain the tracking number and shipping service, so we can
        // also send the customer an email to let them know that their
        // order has shipped successfully
        const mailjetResponse = await handlePackageShipped(body, env);
        // console.log(
        //   "It's ya mailjet Response: ",
        //   JSON.stringify(mailjetResponse, null, 2)
        // );

        return new Response(
          "it's ya boi: webhook 'package_shipped' successful"
        );
      } else {
        //fast fail with 400 response
        console.error("Webhook type not recognized");
        return new Response(
          "Bad Request: The 'type' field is missing or not recognized. " +
            "Please ensure that the 'type' field is present and valid.",
          { status: 400 }
        );
      }
    } catch (err) {
      console.error("Error parsing webhook payload:", err);
    }
    // Default response if we make it out of the try/catch block
    return new Response("it's ya boi");
  } else {
    // We reach here if the request was not a POST with JSON in it
    console.error(
      "Invalid webhook request + wasn't a post + ratio + don't care"
    );
    return new Response("Bad Request 2", { status: 400 });
  }
}
async function sendToAdminForPackageShipped(body, env) {
  const emailPayload = {
    SandboxMode: false,
    Messages: [
      {
        From: {
          Email: env.ADMIN_FROM_EMAIL,
          Name: "iyb webstore dev log",
        },
        To: [
          {
            Email: env.ADMIN_FROM_EMAIL,
            Name: env.ADMIN_FROM_NAME,
          },
        ],
        Subject: "An order has shipped",
        TextPart: JSON.stringify(body, null, 2),
      },
    ],
  };
  // create the auth
  const auth = Buffer.from(
    `${env.MJ_APIKEY_PUBLIC}:${env.MJ_APIKEY_PRIVATE}`
  ).toString("base64");

  // send the message
  const mailjetResponse = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });
  return await mailjetResponse.json();
}

async function handlePackageShipped(body, env) {
  // we need to build the email payload for package shipped email
  const emailPayload = createPackageShippedEmailPayload(env, body);

  // create the auth
  const auth = Buffer.from(
    `${env.MJ_APIKEY_PUBLIC}:${env.MJ_APIKEY_PRIVATE}`
  ).toString("base64");

  // send the message
  const mailjetResponse = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });
  return await mailjetResponse.json();
}

function createPackageShippedEmailPayload(env, body) {
  const customerName = body.data.order.recipient.name;
  const customerEmail = body.data.order.recipient.email;
  const trackingNumber = body.data.shipment.tracking_number;
  const carrier = body.data.shipment.carrier;
  const service = body.data.shipment.service;

  let emailText = `Hello ${customerName},\n\n`;
  emailText += `You have an order shipping ${service} - via ${carrier}.\n\n`;
  emailText += `A tracking number has been created:\n\n`;
  emailText += `${trackingNumber}\n\n`;

  // check if estimated delivery date is present
  if (body.data.shipment.estimated_delivery_dates) {
    const toDate = parseUnixTimestamp(
      body.data.shipment.estimated_delivery_dates.to
    );
    const fromDate = parseUnixTimestamp(
      body.data.shipment.estimated_delivery_dates.from
    );
    if (toDate == fromDate) {
      emailText += `Estimated delivery date: ${toDate}\n\n`;
    } else {
      emailText += `Estimated delivery window: ${toDate} - ${fromDate}\n\n`;
    }
  }

  emailText += `=====\n`;
  emailText += `Thank you for shopping with it's ya boi webstore!\n`;
  emailText += `(Note: if you ordered multiple items that ship separately,\n`;
  emailText += `you may receive additional tracking number emails for each item)\n\n`;

  emailText += `If you have any questions, please email: ${env.ADMIN_FROM_EMAIL}\n\n`;
  emailText += `Best regards,\n`;
  emailText += `- it's ya boi`;

  return {
    SandboxMode: false,
    Messages: [
      {
        From: {
          Email: env.ADMIN_FROM_EMAIL,
          Name: env.ADMIN_FROM_NAME,
        },
        To: [
          {
            // Email: customerEmail,
            Email: env.ADMIN_FROM_EMAIL,
            Name: customerName,
          },
        ],
        Bcc: [
          {
            Email: env.ADMIN_FROM_EMAIL,
            Name: env.ADMIN_FROM_NAME,
          },
        ],
        Subject: "Your order has shipped! - it's ya boi",
        TextPart: emailText,
      },
    ],
  };
}

function buildLineItemsShippedTemplate(body) {
  let lineItems = "";
  // TODO: implement multiple line items parsing from the body
  return lineItems;
}

function createOrderEmailPayload(env, checkoutSession, listItems) {
  let emailText = `Hello ${checkoutSession.customer_details.name},\n\n`;
  emailText += `Your order was recieved:\n\n`;
  emailText += buildLineItemsTemplate(listItems);
  emailText += `=====\n`;
  emailText += `Subtotal: ${currency(checkoutSession.amount_subtotal, {
    fromCents: true,
  }).format()}\n`;
  emailText += `Shipping: ${currency(
    checkoutSession.shipping_cost.amount_total,
    {
      fromCents: true,
    }
  ).format()}\n`;
  emailText += `Total: ${currency(checkoutSession.amount_total, {
    fromCents: true,
  }).format()}\n\n`;
  emailText += `Thanks for shopping with us!\n\n`;
  emailText += `You should receive another email when your order is ready.`;
  emailText += `If you have any questions, please email ${env.ADMIN_FROM_EMAIL}\n\n`;
  emailText += `Best regards,\n`;
  emailText += `- it's ya boi`;

  return {
    SandboxMode: false,
    Messages: [
      {
        From: {
          Email: env.ADMIN_FROM_EMAIL,
          Name: env.ADMIN_FROM_NAME,
        },
        To: [
          {
            Email: checkoutSession.customer_details.email,
            Name: checkoutSession.customer_details.name,
          },
        ],
        Bcc: [
          {
            Email: env.ADMIN_FROM_EMAIL,
            Name: env.ADMIN_FROM_NAME,
          },
        ],
        Subject: "Your order has been recieved - it's ya boi",
        TextPart: emailText,
      },
    ],
  };
}

async function handleOrderCreated(body, env) {
  const stripe = Stripe(env.STRIPE_SECRET_KEY);
  // If we've recieved the webhook 'order_created' event from Printful,
  // cross reference the external_id with the Stripe payment intent id
  const payment_intent = body.data.order.external_id;
  const checkoutSessions = await stripe.checkout.sessions.list({
    payment_intent: payment_intent,
    limit: 1,
  });
  const sessionId = checkoutSessions.data[0].id;
  // console.log(
  //   "It's ya checkoutSession",
  //   JSON.stringify(checkoutSessions, null, 2)
  // );

  // then we can get the order details
  const listLineItems = await stripe.checkout.sessions.listLineItems(sessionId);
  //console.log("It's ya lineItems", JSON.stringify(listLineItems, null, 2));

  const emailPayload = createOrderEmailPayload(
    env,
    checkoutSessions.data[0],
    listLineItems.data
  );

  // create the auth
  const auth = Buffer.from(
    `${env.MJ_APIKEY_PUBLIC}:${env.MJ_APIKEY_PRIVATE}`
  ).toString("base64");

  // send the message
  const mailjetResponse = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });
  return await mailjetResponse.json();
}

// helper function to build the line items part of the email
// takes in an array of line items from stripe API response
function buildLineItemsTemplate(items) {
  let listItems = "";

  items.forEach((item) => {
    const retail_price = currency(item.price.unit_amount, {
      fromCents: true,
    }).format();
    const total_price = currency(item.amount_total, {
      fromCents: true,
    }).format();
    listItems += `• "${item.description}" (x${item.quantity})`;
    listItems += ` - ${retail_price} each\n  Item subtotal: ${total_price}\n`;
    listItems += `\n`;
  });
  return listItems;
}

function parseUnixTimestamp(unixTimestamp) {
  // Convert Unix timestamp to milliseconds
  const timestampMs = unixTimestamp * 1000;

  // Create a new Date object using the milliseconds
  const date = new Date(timestampMs);

  // Extract the desired date components
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // Note: Month is zero-based, so we add 1
  const day = date.getDate();

  // Format the date string
  const formattedDate = `${month}/${day}/${year}`;

  return formattedDate;
}

export default {
  fetch: handleRequest,
};
