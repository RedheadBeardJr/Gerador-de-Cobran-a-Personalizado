'use client';
import { useState } from 'react';

export default function GeradorCobranca() {
  const [form, setForm] = useState({ amount: '', product: '', phone: '' });
  const [loading, setLoading] = useState(false);

  async function handleCreate(method: 'card' | 'pix') {
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: Number(form.amount),
        productName: form.product,
        customerPhone: form.phone,
        paymentMethod: method,
      }),
    });
    const { url } = await res.json();

    // Integração WhatsApp: Abre conversa com o link pronto
    const msg = encodeURIComponent(`Olá! Aqui está o seu link de pagamento para: ${form.product}.\nValor: R$ ${form.amount} em até 10x.\n\nClique aqui: ${url}`);
    window.open(`https://wa.me/55${form.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-6">Gerador de Cobrança - Baltussen</h1>

        <div className="space-y-4">
          <input type="text" placeholder="Nome do Produto (ex: Mochila Executive)" className="w-full border p-3 rounded-lg"
            onChange={e => setForm({ ...form, product: e.target.value })} />

          <input type="number" placeholder="Valor Total (ex: 1500)" className="w-full border p-3 rounded-lg"
            onChange={e => setForm({ ...form, amount: e.target.value })} />

          <input type="text" placeholder="WhatsApp do Cliente (DDD + Número)" className="w-full border p-3 rounded-lg"
            onChange={e => setForm({ ...form, phone: e.target.value })} />

          <div className="grid grid-cols-2 gap-4 pt-4">
            <button onClick={() => handleCreate('card')} disabled={loading} className="bg-black text-white p-4 rounded-xl hover:opacity-90">
              Link Cartão (10x)
            </button>
            <button onClick={() => handleCreate('pix')} disabled={loading} className="bg-teal-600 text-white p-4 rounded-xl hover:opacity-90">
              Link Pix (10x)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
