"use client";

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export default function PhaserGame() {
    const gameRef = useRef(null);
    const socketRef = useRef(null);

    const [telaInicial, setTelaInicial] = useState(true);
    const [nomeInput, setNomeInput] = useState('');
    const [classeInput, setClasseInput] = useState('guerreiro');
    const [gameOver, setGameOver] = useState(false);
    const [mensagens, setMensagens] = useState([]);
    const [chatInput, setChatInput] = useState('');

    const entrarNoJogo = (e) => {
        e.preventDefault();
        if (nomeInput.trim().length > 0) setTelaInicial(false);
    };

    const enviarChat = (e) => {
        e.preventDefault();
        if (chatInput.trim() !== '' && socketRef.current) {
            socketRef.current.emit('chatMensagem', chatInput);
            setChatInput('');
        }
    };

    useEffect(() => {
        if (!telaInicial && typeof window !== 'undefined') {
           socketRef.current = io('https://rpg-game-i4ag.onrender.com/');; // LEMBRA-TE DE MUDAR O IP
            const socket = socketRef.current;

            socket.on('chatNovaMensagem', (msg) => {
                setMensagens(prev => { let novas = [...prev, msg]; if (novas.length > 6) novas.shift(); return novas; });
            });

            import('phaser').then((Phaser) => {
                const config = {
                    type: Phaser.AUTO, width: 800, height: 600, parent: gameRef.current,
                    backgroundColor: '#2d8a4e', physics: { default: 'arcade' },
                    scene: { preload, create, update }
                };
                const game = new Phaser.Game(config);

                let jogadorLocal, cursores, teclaEspaco;
                let outrosJogadores = {}, cenario, npc, textoDialogo;
                let faseAtual = 0;
                let textosInfo = {}, barrasVida = {}, spritesSlimes = {}, barrasVidaSlimes = {};
                let ultimaDirecao = 'baixo';
                let magiasAtivas = [];

                function preload() {
                    this.load.spritesheet('boneco', 'https://labs.phaser.io/assets/sprites/dude.png', { frameWidth: 32, frameHeight: 48 });
                    this.load.image('pedra', 'https://labs.phaser.io/assets/sprites/block.png');
                    this.load.image('slime', 'https://labs.phaser.io/assets/sprites/orb-green.png');
                }

                function aplicarVisualClasse(sprite, classe) {
                    switch (classe) {
                        case 'guerreiro': sprite.setTint(0xdddddd); break; // Prata
                        case 'mago': sprite.setTint(0xaa00ff); break;      // Roxo
                        case 'arqueiro': sprite.setTint(0x00ff00); break;  // Verde
                        case 'tanque': sprite.setTint(0xff8800); break;    // Laranja
                        default: sprite.setTint(0xffffff);
                    }
                }

                function atualizarBarraVida(barra, x, y, vida, maxVida, isBoss = false) {
                    barra.clear();
                    let largura = isBoss ? 150 : 40; let altura = isBoss ? 12 : 6; let offsetY = isBoss ? 100 : 50;
                    barra.fillStyle(0x550000); barra.fillRect(x - largura / 2, y - offsetY, largura, altura);
                    let perc = Math.max(0, vida / maxVida);
                    barra.fillStyle(isBoss ? 0xffcc00 : 0x00ff00); barra.fillRect(x - largura / 2, y - offsetY, largura * perc, altura);
                }

                function criarEfeitoAtaque(cena, x, y, direcao, classe) {
                    if (classe === 'guerreiro') {
                        let slash = cena.add.graphics(); slash.lineStyle(6, 0xffffff, 1);
                        // ... (código anterior da espada) ...
                        cena.tweens.add({ targets: slash, alpha: 0, scale: 1.3, duration: 200, onComplete: () => slash.destroy() });
                    } else if (classe === 'arqueiro') {
                        // Efeito de flecha: um pequeno círculo laranja que se move rápido
                        let flecha = cena.add.circle(x, y, 4, 0xffa500);
                        cena.tweens.add({ targets: flecha, x: direcao === 'direita' ? x + 100 : x - 100, alpha: 0, duration: 300, onComplete: () => flecha.destroy() });
                    } else if (classe === 'tanque') {
                        // Efeito de escudo/impacto: um círculo grande que expande e empurra
                        let impacto = cena.add.circle(x, y, 20, 0xff8800, 0.5);
                        cena.tweens.add({ targets: impacto, scale: 2, alpha: 0, duration: 400, onComplete: () => impacto.destroy() });
                    }
                }

                function create() {
                    const cena = this;
                    cenario = cena.physics.add.staticGroup();
                    for (let i = 0; i < 800; i += 50) { cenario.create(i, 20, 'pedra').setScale(0.5).refreshBody(); cenario.create(i, 580, 'pedra').setScale(0.5).refreshBody(); }
                    for (let i = 0; i < 600; i += 50) { cenario.create(20, i, 'pedra').setScale(0.5).refreshBody(); cenario.create(780, i, 'pedra').setScale(0.5).refreshBody(); }

                    npc = cena.physics.add.staticSprite(400, 150, 'boneco', 4); npc.setTint(0xffd700);
                    textoDialogo = cena.add.text(400, 100, 'A Caverna espera-vos...\nAperta ESPAÇO perto de mim para entrar!', { fontSize: '14px', fill: '#fff', backgroundColor: '#000', padding: 5 }).setOrigin(0.5);

                    cena.anims.create({ key: 'esquerda', frames: cena.anims.generateFrameNumbers('boneco', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
                    cena.anims.create({ key: 'parado', frames: [{ key: 'boneco', frame: 4 }], frameRate: 20 });
                    cena.anims.create({ key: 'direita', frames: cena.anims.generateFrameNumbers('boneco', { start: 5, end: 8 }), frameRate: 10, repeat: -1 });

                    cursores = cena.input.keyboard.createCursorKeys();
                    teclaEspaco = cena.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

                    socket.on('faseAtualizada', (novaFase) => {
                        faseAtual = novaFase;
                        if (faseAtual === 0 || faseAtual === 5) {
                            cena.cameras.main.setBackgroundColor('#2d8a4e'); npc.setVisible(true); textoDialogo.setVisible(true);
                            if (faseAtual === 5) textoDialogo.setText('Vocês limparam a Caverna!\nObrigado Heróis!');
                        } else { cena.cameras.main.setBackgroundColor('#2a2a2a'); npc.setVisible(false); textoDialogo.setVisible(false); }
                    });

                    socket.on('avisoAtaque', (dados) => {
                        let circulo = cena.add.circle(dados.x, dados.y, dados.raio, 0xff0000, 0.3);
                        // Animação para "avisar" antes do dano
                        cena.tweens.add({
                            targets: circulo,
                            alpha: 0.6,
                            scale: 0.8,
                            duration: dados.tempo, // tempo que o servidor envia
                            onComplete: () => circulo.destroy()
                        });
                    });

                    // 🔵 Efeito de EXPLOSÃO (Dano Real)
                    socket.on('efeitoAoE', (dados) => {
                        let explosao = cena.add.circle(dados.x, dados.y, dados.raio, 0x00aaff, 0.8);
                        cena.tweens.add({
                            targets: explosao,
                            alpha: 0,
                            scale: 1.5,
                            duration: 300,
                            onComplete: () => explosao.destroy()
                        });
                    });

                    // NOVO: Ver o ataque de espada do amigo!
                    socket.on('outroAtaqueGuerreiro', (dados) => {
                        criarEfeitoAtaque(cena, dados.x, dados.y, dados.direcao);
                    });

                    socket.on('novaMagia', (dados) => {
                        let magia = cena.add.circle(dados.x, dados.y, 8, 0xff5500);
                        cena.physics.add.existing(magia);
                        magia.body.setVelocity(dados.vx, dados.vy);
                        setTimeout(() => magia.destroy(), 1000);
                    });

                    socket.on('jogadoresAtuais', (jogServidor) => {
                        Object.keys(jogServidor).forEach((id) => {
                            const j = jogServidor[id];
                            if (id === socket.id) {
                                jogadorLocal = cena.physics.add.sprite(j.x, j.y, 'boneco');
                                aplicarVisualClasse(jogadorLocal, j.classe);
                                jogadorLocal.setCollideWorldBounds(true); cena.physics.add.collider(jogadorLocal, cenario);
                                textosInfo[id] = cena.add.text(j.x, j.y - 65, `[Lv.${j.nivel}] ${j.nome}\nHP: ${j.vida}`, { fontSize: '12px', fill: '#fff', align: 'center', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
                                barrasVida[id] = cena.add.graphics();
                            } else { adicionarOutroJogador(cena, j); }
                        });
                    });

                    socket.on('novoJogador', (j) => adicionarOutroJogador(cena, j));
                    socket.on('jogadorMoveu', (j) => {
                        let o = outrosJogadores[j.id];
                        if (o) {
                            o.setPosition(j.x, j.y); if (textosInfo[j.id]) textosInfo[j.id].setPosition(j.x, j.y - 65);
                            try { if (j.direcao === 'esquerda') o.anims.play('esquerda', true); else if (j.direcao === 'direita') o.anims.play('direita', true); else o.anims.play('parado', true); } catch (e) { }
                        }
                    });
                    socket.on('jogadorAtualizado', (j) => {
                        if (textosInfo[j.id]) textosInfo[j.id].setText(`[Lv.${j.nivel}] ${j.nome}\nHP: ${j.vida}`);
                        if (barrasVida[j.id]) atualizarBarraVida(barrasVida[j.id], j.x, j.y, j.vida, j.maxVida);
                        let alvo = j.id === socket.id ? jogadorLocal : outrosJogadores[j.id];
                        if (alvo) { if (j.morto) { alvo.setAlpha(0.2); alvo.setTint(0xff0000); } else { alvo.setAlpha(1); aplicarVisualClasse(alvo, j.classe); } }
                    });
                    socket.on('jogadorDesconectado', (id) => {
                        if (outrosJogadores[id]) { outrosJogadores[id].destroy(); delete outrosJogadores[id]; }
                        if (textosInfo[id]) { textosInfo[id].destroy(); delete textosInfo[id]; }
                        if (barrasVida[id]) { barrasVida[id].destroy(); delete barrasVida[id]; }
                    });

                    socket.on('slimesAtuais', (slimesServidor) => {
                        slimesServidor.forEach(s => {
                            if (!spritesSlimes[s.id]) {
                                let escala = s.isBoss ? 6 : 1.5; let cor = s.isBoss ? 0xff0000 : 0x0088ff;
                                let novoSlime = cena.physics.add.sprite(s.x, s.y, 'slime').setScale(escala);
                                novoSlime.setTint(cor); novoSlime.isBoss = s.isBoss;
                                spritesSlimes[s.id] = novoSlime;
                                barrasVidaSlimes[s.id] = cena.add.graphics();
                                atualizarBarraVida(barrasVidaSlimes[s.id], s.x, s.y, s.vida, s.maxVida, s.isBoss);
                            }
                        });
                    });

                    socket.on('slimesMovimento', (slimesServidor) => {
                        slimesServidor.forEach(s => {
                            // CORREÇÃO: Se o slime não existir na tua tela por causa de lag, ele é criado na hora!
                            if (!spritesSlimes[s.id] && s.vivo) {
                                let escala = s.isBoss ? 6 : 1.5; let cor = s.isBoss ? 0xff0000 : 0x0088ff;
                                let novoSlime = cena.physics.add.sprite(s.x, s.y, 'slime').setScale(escala);
                                novoSlime.setTint(cor); novoSlime.isBoss = s.isBoss;
                                spritesSlimes[s.id] = novoSlime;
                                barrasVidaSlimes[s.id] = cena.add.graphics();
                            }

                            let spr = spritesSlimes[s.id];
                            if (spr) {
                                if (s.vivo) {
                                    spr.setPosition(s.x, s.y);
                                    if (barrasVidaSlimes[s.id]) atualizarBarraVida(barrasVidaSlimes[s.id], s.x, s.y, s.vida, s.maxVida, s.isBoss);
                                } else {
                                    spr.setTint(0x555555);
                                    if (barrasVidaSlimes[s.id]) { barrasVidaSlimes[s.id].clear(); }
                                }
                            }
                        });
                    });

                    socket.on('gameOver', () => setGameOver(true));

                    // MUDANÇA: O emit 'entrarJogo' agora só corre no FIM do setup, 
                    // para garantir que os listeners (escutas) já estão prontos quando os dados do servidor chegarem!
                    socket.emit('entrarJogo', { nome: nomeInput, classe: classeInput });
                }

                function adicionarOutroJogador(cena, j) {
                    const o = cena.physics.add.sprite(j.x, j.y, 'boneco');
                    aplicarVisualClasse(o, j.classe);
                    outrosJogadores[j.id] = o;
                    textosInfo[j.id] = cena.add.text(j.x, j.y - 65, `[Lv.${j.nivel}] ${j.nome}\nHP: ${j.vida}`, { fontSize: '12px', fill: '#fff', align: 'center', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
                    barrasVida[j.id] = cena.add.graphics();
                }

                let ultimoAtaque = 0;

                function update(tempo) {
                    let aEscreverNoChat = document.activeElement.tagName === 'INPUT';

                    if (jogadorLocal && jogadorLocal.body && jogadorLocal.alpha > 0.5 && !gameOver && !aEscreverNoChat) {
                        jogadorLocal.setVelocity(0);
                        let direcaoAtual = 'parado';

                        try {
                            if (cursores.left.isDown) { jogadorLocal.setVelocityX(-160); jogadorLocal.anims.play('esquerda', true); direcaoAtual = 'esquerda'; ultimaDirecao = 'esquerda'; }
                            else if (cursores.right.isDown) { jogadorLocal.setVelocityX(160); jogadorLocal.anims.play('direita', true); direcaoAtual = 'direita'; ultimaDirecao = 'direita'; }
                            else if (cursores.up.isDown) { jogadorLocal.setVelocityY(-160); jogadorLocal.anims.play('direita', true); direcaoAtual = 'cima'; ultimaDirecao = 'cima'; }
                            else if (cursores.down.isDown) { jogadorLocal.setVelocityY(160); jogadorLocal.anims.play('esquerda', true); direcaoAtual = 'baixo'; ultimaDirecao = 'baixo'; }
                            else { jogadorLocal.anims.play('parado'); }
                        } catch (e) { }

                        if (textosInfo[socket.id]) textosInfo[socket.id].setPosition(jogadorLocal.x, jogadorLocal.y - 65);
                        if (barrasVida[socket.id]) atualizarBarraVida(barrasVida[socket.id], jogadorLocal.x, jogadorLocal.y, 100, 100);

                        const x = jogadorLocal.x; const y = jogadorLocal.y;
                        if (!jogadorLocal.posicaoAntiga || x !== jogadorLocal.posicaoAntiga.x || y !== jogadorLocal.posicaoAntiga.y || direcaoAtual !== jogadorLocal.posicaoAntiga.direcao) {
                            socket.emit('movimentoJogador', { x: x, y: y, direcao: direcaoAtual });
                        }
                        jogadorLocal.posicaoAntiga = { x: x, y: y, direcao: direcaoAtual };



                        if (Phaser.Input.Keyboard.JustDown(teclaEspaco)) {

                            // SITUAÇÃO 1: Está no Lobby (Fase 0) ou Ganhou (Fase 5)
                            if (faseAtual === 0 || faseAtual === 5) {
                                // Checa se está perto do NPC Dourado para entrar
                                if (npc && npc.visible && Phaser.Math.Distance.Between(x, y, npc.x, npc.y) < 80) {
                                    socket.emit('entrarCaverna'); // NOTA: Se o teu servidor usar outro nome como 'entrarCaverna', muda aqui!
                                }
                            }
                            // SITUAÇÃO 2: Está dentro da Caverna (Fase > 0) -> ATACAR!
                            else if (faseAtual > 0 && tempo > ultimoAtaque + 500) {
                                switch (classeInput) {
                                    case 'guerreiro':
                                        socket.emit('ataqueGuerreiro', { x, y, direcao: ultimaDirecao });
                                        criarEfeitoAtaque(this, x, y, ultimaDirecao, 'guerreiro');

                                        Object.keys(spritesSlimes).forEach(id => {
                                            let s = spritesSlimes[id];
                                            if (s && s.active && s.tintTopLeft !== 0x555555 && Phaser.Math.Distance.Between(x, y, s.x, s.y) < (s.isBoss ? 100 : 60)) {
                                                socket.emit('atacarSlime', id);
                                            }
                                        });
                                        break;

                                    case 'tanque':
                                        socket.emit('atacarSlam', { x, y });
                                        criarEfeitoAtaque(this, x, y, ultimaDirecao, 'tanque');

                                        Object.keys(spritesSlimes).forEach(id => {
                                            let s = spritesSlimes[id];
                                            if (s && s.active && s.tintTopLeft !== 0x555555 && Phaser.Math.Distance.Between(x, y, s.x, s.y) < (s.isBoss ? 120 : 80)) {
                                                socket.emit('atacarSlime', id);
                                            }
                                        });
                                        break;

                                    case 'arqueiro':
                                    case 'mago':
                                        let velocidade = 400;
                                        let vx = (ultimaDirecao === 'direita') ? velocidade : (ultimaDirecao === 'esquerda' ? -velocidade : 0);
                                        let vy = (ultimaDirecao === 'cima') ? -velocidade : (ultimaDirecao === 'baixo' ? velocidade : 0);

                                        socket.emit('atirarMagia', { x, y, vx, vy, tipo: classeInput });

                                        let corProjetil = classeInput === 'mago' ? 0xff5500 : 0xffa500;
                                        let projetil = this.add.circle(x, y, 6, corProjetil);
                                        this.physics.add.existing(projetil);
                                        projetil.body.setVelocity(vx, vy);

                                        magiasAtivas.push(projetil);
                                        setTimeout(() => projetil.destroy(), 1000);
                                        break;
                                }
                                ultimoAtaque = tempo;
                            }
                        }
                    } else if (jogadorLocal && jogadorLocal.body) { jogadorLocal.setVelocity(0); jogadorLocal.anims.play('parado'); }

                    if (classeInput === 'mago') {
                        magiasAtivas.forEach(magia => {
                            if (magia && magia.active) {
                                Object.keys(spritesSlimes).forEach(id => {
                                    let s = spritesSlimes[id];
                                    if (s && s.active && s.tintTopLeft !== 0x555555 && Phaser.Math.Distance.Between(magia.x, magia.y, s.x, s.y) < (s.isBoss ? 80 : 30)) {
                                        socket.emit('atacarSlime', id);
                                        magia.destroy();
                                    }
                                });
                            }
                        });
                        magiasAtivas = magiasAtivas.filter(m => m.active);
                    }
                }

                return () => { if (socket) socket.disconnect(); game.destroy(true); };
            });
        }
    }, [telaInicial, gameOver]);

    if (telaInicial) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-96 text-center border-2 border-gray-600">
                    <h1 className="text-4xl font-black mb-6 text-green-400">Slime Cave MMO</h1>
                    <form onSubmit={entrarNoJogo} className="flex flex-col gap-4">
                        <input type="text" placeholder="Teu Nome Heróico" maxLength="12" value={nomeInput} onChange={e => setNomeInput(e.target.value)} required className="p-3 rounded bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-400" />

                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {['guerreiro', 'mago', 'arqueiro', 'tanque'].map((c) => (
                                <label key={c} className={`p-2 rounded cursor-pointer border-2 capitalize ${classeInput === c ? 'border-blue-400 bg-gray-600' : 'border-gray-700'}`}>
                                    <input type="radio" name="classe" value={c} className="hidden" onChange={() => setClasseInput(c)} />
                                    {c}
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Guerreiros têm armadura prateada e dão mais dano de perto. Magos têm manto roxo e atacam de longe.</p>

                        <button type="submit" className="mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded text-xl shadow-lg transition-transform transform hover:scale-105">Entrar na Aventura</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center relative min-h-screen bg-gray-900 p-4">
            <div ref={gameRef} className="border-4 border-gray-600 rounded-lg shadow-2xl overflow-hidden relative">
                <div className="absolute bottom-4 left-4 w-64 bg-black/60 p-2 rounded pointer-events-auto">
                    <div className="h-32 overflow-y-auto mb-2 text-sm drop-shadow-md flex flex-col justify-end">
                        {mensagens.map((msg, i) => (
                            <div key={i} style={{ color: msg.cor || '#fff' }}>
                                <strong>{msg.autor}:</strong> {msg.texto}
                            </div>
                        ))}
                    </div>
                    <form onSubmit={enviarChat} className="flex">
                        <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Escreve aqui..." className="w-full bg-black/50 text-white border border-gray-500 p-1 rounded-l text-sm focus:outline-none" />
                        <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-3 rounded-r text-sm font-bold">Enviar</button>
                    </form>
                </div>

                {gameOver && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
                        <h1 className="text-6xl font-black text-red-600 mb-4 animate-bounce">A CAVERNA VENCEU</h1>
                        <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded shadow-lg transition-transform transform hover:scale-110">Voltar ao Menu</button>
                    </div>
                )}
            </div>
            <p className="text-gray-300 mt-4 text-sm font-bold bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-xl">
                Espaço: Atacar | WASD/Setas: Mover | Usa o Chat para planear ataques!
            </p>
        </div>
    );
}