# Gerador-de-Cobran-a-Personalizado
Crie para mim um painel SaaS com autenticação de usuário e pagamentos Stripe

```markdown
# Gerador-de-Cobran-a-Personalizado
Projeto scaffold de um Painel SaaS simples com autenticação e pagamentos Stripe.

Instalação rápida:

1. Copie `.env.example` para `.env` e preencha as chaves Stripe e `SESSION_SECRET`.
2. Instale dependências: `npm install`
3. Rode em modo dev: `npm run dev` ou `npm start`

Use `stripe listen` (Stripe CLI) para testar webhooks localmente e configure `STRIPE_WEBHOOK_SECRET`.

Notificações (opcional):
- Para receber alertas via WhatsApp, configure no `.env`:
  - `ADMIN_WHATSAPP` (ex.: `+5511999999999`)
  - **Provider genérico**: `WA_API_URL` e `WA_API_TOKEN` — o helper envia `{ to, message }` como JSON com `Authorization: Bearer <token>`.
  - **Twilio** (opcional): defina `WA_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `WA_FROM` (ex.: `whatsapp:+14155238886`). O helper enviará mensagens via Twilio Messages API.
- O helper de notificação está em `src/notifications.js` e escolhe o provedor automaticamente com `WA_PROVIDER` (fallback para `generic` se `WA_API_URL` estiver definido, caso contrário `twilio`).

Arquivos principais:
- `server.js` - servidor Express com rotas de auth, billing e webhook
- `src/db.js` - helper SQLite
- `views/` - templates EJS
```

Prisma (opcional):

- Arquivo de schema em `prisma/schema.prisma` já contém o modelo `User`.
- Para usar Prisma: instale dependências (`npm install`), gere o cliente `npx prisma generate` e aplique o schema com `npx prisma db push`.
