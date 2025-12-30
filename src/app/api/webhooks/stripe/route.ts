import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';

// stripe constructor expects a config that includes apiVersion; pass undefined to satisfy the typing when API version is not required
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY! as string, undefined as any);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // lazy-require helper (works whether module is CJS or ESM)
  const { sendWhatsApp } = require(process.cwd() + '/src/notifications.js');
  const adminPhone = process.env.ADMIN_WHATSAPP || '';

  // 1. Pagamento de Cartão (Único/Parcelado) ou primeira parcela do Pix
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const amount = session.amount_total ?? (session.payment_intent ? (async () => {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
      return pi.amount;
    })() : undefined);

    const amountBRL = typeof amount === 'number' ? (amount / 100).toFixed(2) : '—';
    console.log(`💰 Sucesso! Pagamento de R$${amountBRL} recebido.`);

    if (adminPhone) {
      const email = (session.customer_details && session.customer_details.email) || session.customer_email || 'cliente';
      sendWhatsApp(adminPhone, `💰 Pagamento recebido: R$ ${amountBRL} \nCliente: ${email}`);
    }
  }

  // 2. Pagamento de parcelas recorrentes (Pix mês a mês)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    console.log(`📈 Parcela mensal paga pelo cliente: ${invoice.customer_email}`);

    // Se a invoice tiver subscription, atualizamos contadores e possivelmente cancelamos
    const subscriptionId = invoice.subscription as string | undefined;
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const maxInstallments = parseInt(subscription.metadata?.max_installments || '0', 10);
        const paymentsMade = parseInt(subscription.metadata?.payments_made || '0', 10) + 1;

        await stripe.subscriptions.update(subscriptionId, { metadata: { ...(subscription.metadata || {}), payments_made: String(paymentsMade) } });

        if (adminPhone) {
          sendWhatsApp(adminPhone, `📈 Parcela paga: R$ ${(invoice.amount_paid || invoice.total || 0) / 100} \nCliente: ${invoice.customer_email || 'cliente'} \nParcela: ${paymentsMade}/${maxInstallments || '∞'}`);
        }

        if (maxInstallments > 0 && paymentsMade >= maxInstallments) {
          await stripe.subscriptions.del(subscriptionId);
        }
      } catch (err) {
        console.error('Erro ao processar invoice.payment_succeeded', err);
      }
    }
  }

  // 3. Falha no pagamento
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    console.log(`⚠️ Alerta: O pagamento da parcela de ${invoice.customer_email} falhou!`);
    if (adminPhone) {
      sendWhatsApp(adminPhone, `⚠️ Pagamento falhou: R$ ${(invoice.amount_due || invoice.total || 0) / 100} \nCliente: ${invoice.customer_email || 'cliente'}`);
    }
  }

  return new NextResponse(null, { status: 200 });
}
