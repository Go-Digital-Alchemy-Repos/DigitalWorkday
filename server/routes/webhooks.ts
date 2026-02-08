import { Router, raw } from "express";
import {
  getStripeWebhookSecret,
  getStripeSecretKey,
  StripeConfigError,
} from "../config/stripe";

const router = Router();

function errorEnvelope(
  code: string,
  message: string,
  status: number,
  requestId: string
) {
  return {
    ok: false,
    requestId,
    error: { code, message, status, requestId },
    message,
    code,
  };
}

router.post("/stripe", raw({ type: "application/json" }), async (req, res) => {
  const requestId = req.requestId || `wh-${Date.now()}`;
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    console.warn(`[stripe-webhook] [${requestId}] Missing stripe-signature header`);
    return res.status(400).json(
      errorEnvelope("VALIDATION_ERROR", "Missing stripe-signature header", 400, requestId)
    );
  }

  let webhookSecret: string;
  try {
    const result = await getStripeWebhookSecret();
    webhookSecret = result.secret;
  } catch (err) {
    if (err instanceof StripeConfigError) {
      console.error(`[stripe-webhook] [${requestId}] Configuration error: ${err.message}`);
    } else {
      console.error(`[stripe-webhook] [${requestId}] Unexpected error retrieving webhook secret`);
    }
    return res.status(500).json(
      errorEnvelope("INTERNAL_ERROR", "Stripe webhook secret misconfigured", 500, requestId)
    );
  }

  let stripeSecretKey: string;
  try {
    stripeSecretKey = await getStripeSecretKey();
  } catch (err) {
    if (err instanceof StripeConfigError) {
      console.error(`[stripe-webhook] [${requestId}] Stripe API key misconfigured: ${err.message}`);
    } else {
      console.error(`[stripe-webhook] [${requestId}] Unexpected error retrieving Stripe API key`);
    }
    return res.status(500).json(
      errorEnvelope("INTERNAL_ERROR", "Stripe API key misconfigured", 500, requestId)
    );
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
    });

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature as string,
        webhookSecret
      );
    } catch (err: any) {
      console.error(`[stripe-webhook] [${requestId}] Signature verification failed`);
      return res.status(400).json(
        errorEnvelope("VALIDATION_ERROR", "Invalid signature", 400, requestId)
      );
    }

    console.log(`[stripe-webhook] [${requestId}] Received event: ${event.type}`);

    const supportedEventTypes = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "customer.created",
      "customer.updated",
    ];

    if (supportedEventTypes.includes(event.type)) {
      console.log(`[stripe-webhook] [${requestId}] Processing supported event: ${event.type}`);
    } else {
      console.log(`[stripe-webhook] [${requestId}] Ignoring unsupported event: ${event.type}`);
    }

    res.status(200).json({ received: true, eventType: event.type });
  } catch (error: any) {
    console.error(`[stripe-webhook] [${requestId}] Error processing webhook`);
    return res.status(500).json(
      errorEnvelope("INTERNAL_ERROR", "Webhook processing failed", 500, requestId)
    );
  }
});

export default router;
