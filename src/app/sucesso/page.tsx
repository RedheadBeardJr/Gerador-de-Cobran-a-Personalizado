export default function Sucesso() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg">
        <div className="text-6xl mb-4">✨</div>
        <h1 className="text-3xl font-serif font-bold mb-4">Pagamento Confirmado!</h1>
        <p className="text-gray-600 mb-6 italic">
          "Não é só uma Mochila de couro, é uma Baltussen."
        </p>
        <p className="text-sm text-gray-500">
          Você receberá as informações de envio e transformação em seu e-mail e WhatsApp em breve.
        </p>
        <button onClick={() => (window.location.href = '/')} className="mt-8 bg-black text-white px-8 py-3 rounded-full">
          Voltar para a Loja
        </button>
      </div>
    </div>
  );
}
