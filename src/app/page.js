// src/app/page.js
import PhaserGame from "./components/PhaserGame";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      <h1 className="text-4xl font-bold text-yellow-400 mb-6 drop-shadow-md">
        Caverna do Boss Slime
      </h1>
      
      {/* Aqui chamamos o nosso componente do jogo! */}
      <PhaserGame />
      
    </main>
  );
}